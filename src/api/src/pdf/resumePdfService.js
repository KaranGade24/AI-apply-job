import path from "path";
import crypto from "crypto";
import { renderHtmlToPdf } from "./pdfRenderer.js";
import { resumeRenderer } from "./resumeRenderer.js";
import { validatePdfPageCount } from "./pdfValidator.js";
import { RESUME_TEMPLATES, RESUME_PAGE_COUNT, resolveUserResumeSettings } from "../constant/application.constant.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";
import { findUserById, findUserProfileByUserId } from "../repositories/user.repository.js";

/**
 * Delegates HTML building to resumeRenderer
 * @param {object} resumeData
 * @param {string} template
 * @param {string} userId
 * @param {number} scaleMultiplier
 * @returns {Promise<string>} HTML string
 */
export const buildResumeHtml = async (resumeData = {}, template, userId, scaleMultiplier = 1.0) => {
  let activeTemplate = template;
  if (!activeTemplate && userId) {
    const userSettings = await resolveUserResumeSettings(userId);
    activeTemplate = userSettings.template;
  }
  
  // Default fallback
  activeTemplate = activeTemplate || "ATS Modern";
  
  // Map template ID/Name to internal theme name
  let themeName = "modern";
  const lowerT = activeTemplate.toLowerCase();
  if (lowerT.includes("minimal")) themeName = "minimal";
  else if (lowerT.includes("ats")) themeName = "ats";
  
  return await resumeRenderer.render({ ...resumeData, scaleMultiplier }, themeName);
};

/**
 * Generates a tailored PDF resume from structured JSON data with dynamic page auto-fit scaling.
 * Includes a validation loop to ensure the final PDF matches the target page count.
 * @param {object} params
 * @param {object} params.resumeData - Tailored structured resume JSON
 * @param {string} [params.template] - Resume PDF template choice
 * @param {string} [params.filename] - Custom output filename
 * @param {string} [params.userId] - Optional User ID to fetch fallback user profile details
 * @param {number|string} [params.targetPages] - Target page length (default: RESUME_PAGE_COUNT)
 * @returns {Promise<string>} Output PDF file path
 */
export const generateResumePdf = async ({ resumeData, template = "ATS Modern", filename, userId, targetPages }) => {
  try {
    if (!resumeData || typeof resumeData !== "object") {
      throw new appError("Valid resumeData object is required to generate PDF", 400);
    }

    let personalInfo = { ...(resumeData.personalInfo || resumeData.personal || {}) };

    // Fetch user profile or user record if userId is provided or info is incomplete
    if (userId || !personalInfo.fullName || personalInfo.fullName === "Candidate" || personalInfo.fullName === "Candidate Resume" || !personalInfo.phone || !personalInfo.email) {
      try {
        let userProfile = null;
        let userRecord = null;

        if (userId) {
          userProfile = await findUserProfileByUserId(userId);
          userRecord = await findUserById(userId);
        }

        const profilePersonal = userProfile?.personal || {};
        const profileLinks = userProfile?.links || {};

        if (!personalInfo.fullName || personalInfo.fullName === "Candidate" || personalInfo.fullName === "Candidate Resume") {
          if (profilePersonal.firstName || profilePersonal.lastName) {
            personalInfo.fullName = `${profilePersonal.firstName || ''} ${profilePersonal.lastName || ''}`.trim();
          } else if (userProfile?.fullName && userProfile.fullName !== "Candidate") {
            personalInfo.fullName = userProfile.fullName;
          } else if (userRecord?.username && userRecord.username !== "Candidate") {
            personalInfo.fullName = userRecord.username;
          }
        }

        if (!personalInfo.phone) {
          personalInfo.phone = profilePersonal.phone || "";
        }

        if (!personalInfo.email) {
          personalInfo.email = userRecord?.email || "";
        }

        if (!personalInfo.location) {
          personalInfo.location = profilePersonal.address || "";
        }

        if (!personalInfo.linkedin) {
          personalInfo.linkedin = profileLinks.linkedin || "";
        }

        if (!personalInfo.github) {
          personalInfo.github = profileLinks.github || "";
        }
      } catch (dbErr) {
        if (typeof logError === "function") {
          await logError("resumePdfService.generateResumePdf.fetchUserInfo", dbErr.message);
        }
      }
    }

    // Resolve user-specific dynamic constants from DB
    const userSettings = userId ? await resolveUserResumeSettings(userId) : { template: "ATS Modern", pageCount: RESUME_PAGE_COUNT };
    
    const activeTemplate = template || userSettings.template;
    const activePageCount = parseInt(targetPages || resumeData.targetPages || userSettings.pageCount || 1, 10);

    resumeData.personalInfo = personalInfo;
    resumeData.targetPages = activePageCount;

    // Map template ID/Name to internal theme name
    let themeName = "modern";
    const lowerT = activeTemplate.toLowerCase();
    if (lowerT.includes("minimal")) themeName = "minimal";
    else if (lowerT.includes("ats")) themeName = "ats";
    
    const fullName = personalInfo.fullName || personalInfo.name || "Candidate Resume";
    const nameParts = fullName.trim().split(/\s+/);
    
    // First Name
    const rawFirstName = personalInfo.firstName || nameParts[0] || "Candidate";
    const firstName = rawFirstName.replace(/[^a-zA-Z0-9]/g, "") || "Candidate";

    // Last Name
    const rawLastName = personalInfo.lastName || (nameParts.length > 1 ? nameParts.slice(1).join("_") : "");
    const lastName = rawLastName.replace(/[^a-zA-Z0-9_]/g, "");

    // Contact Number
    const rawPhone = personalInfo.phone || personalInfo.contactNo || personalInfo.phoneNumber || "";
    const digits = String(rawPhone).replace(/[^0-9]/g, "");
    const contactNo = digits.length >= 6 ? digits : (digits || "0000000000");

    // Random Cryptic Unique ID (8 hex chars)
    const randomCrypticId = crypto.randomBytes(4).toString("hex");

    // Strictly format: <FirstName>_<LastName>_<ContactNo>_<RandomCrypticId>.pdf or <FirstName>_<ContactNo>_<RandomCrypticId>.pdf
    const namePrefix = lastName ? `${firstName}_${lastName}` : firstName;
    const pdfFilename = `${namePrefix}_${contactNo}_${randomCrypticId}.pdf`;
    const outputPath = path.join("uploads", "resumes", pdfFilename);

    // Dynamic Robust Fitting Loop
    let currentScaleMultiplier = 1.0;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let savedPath = "";

    while (attempts < MAX_ATTEMPTS) {
      const htmlContent = await resumeRenderer.render({ ...resumeData, scaleMultiplier: currentScaleMultiplier }, themeName);
      savedPath = await renderHtmlToPdf(htmlContent, outputPath);

      // Verify actual page count
      const validation = await validatePdfPageCount(savedPath, activePageCount);
      
      if (validation.isValid) {
        break; // Success!
      }

      // If invalid, adjust multiplier and retry
      if (validation.actualPages > activePageCount) {
        // Too many pages, reduce scaling significantly
        currentScaleMultiplier *= 0.94; 
      } else {
        // Too few pages, increase scaling (user wants it to fill the page)
        currentScaleMultiplier *= 1.05;
      }
      
      attempts++;
    }

    return savedPath;
  } catch (error) {
    if (typeof logError === "function") {
      await logError("resumePdfService.generateResumePdf", error.message);
    }
    throw error;
  }
};
