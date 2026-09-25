import path from "path";
import crypto from "crypto";
import { renderHtmlToPdf } from "./pdfRenderer.js";
import { resumeRenderer } from "./resumeRenderer.js";
import { RESUME_TEMPLATES, RESUME_PAGE_COUNT, resolveUserResumeSettings } from "../constant/application.constant.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";
import { findUserById, findUserProfileByUserId } from "../repositories/user.repository.js";

/**
 * Delegates HTML building to resumeRenderer
 * @param {object} resumeData
 * @param {string} template
 * @returns {Promise<string>} HTML string
 */
export const buildResumeHtml = async (resumeData = {}, template, userId) => {
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
  else if (lowerT.includes("tech")) themeName = "modern"; // Or a specific tech theme if available
  
  return await resumeRenderer.render(resumeData, themeName);
};

/**
 * Generates a tailored PDF resume from structured JSON data with dynamic page auto-fit scaling.
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
    if (userId || !personalInfo.fullName || !personalInfo.phone || !personalInfo.email) {
      try {
        let userProfile = null;
        let userRecord = null;

        if (userId) {
          userProfile = await findUserProfileByUserId(userId);
          userRecord = await findUserById(userId);
        }

        const profilePersonal = userProfile?.personal || {};
        const profileLinks = userProfile?.links || {};

        if (!personalInfo.fullName && !personalInfo.name) {
          if (profilePersonal.firstName || profilePersonal.lastName) {
            personalInfo.fullName = `${profilePersonal.firstName || ''} ${profilePersonal.lastName || ''}`.trim();
          } else if (userRecord?.username) {
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
    const activePageCount = targetPages || resumeData.targetPages || userSettings.pageCount;

    resumeData.personalInfo = personalInfo;
    resumeData.targetPages = activePageCount;

    // Map template ID/Name to internal theme name
    let themeName = "modern";
    const lowerT = activeTemplate.toLowerCase();
    if (lowerT.includes("minimal")) themeName = "minimal";
    else if (lowerT.includes("ats")) themeName = "ats";
    
    const htmlContent = await resumeRenderer.render(resumeData, themeName);

    const fullName = personalInfo.fullName || personalInfo.name || "Candidate Name";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0]?.toLowerCase().replace(/[^a-z0-9]/gi, "") || "candidate";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join("_").toLowerCase().replace(/[^a-z0-9]/gi, "") : "user";
    const rawPhone = personalInfo.phone || "";
    const phone = rawPhone.replace(/[^0-9]/g, "") || "0000000000";
    const cryptoRandomId = crypto.randomBytes(4).toString("hex");

    const defaultFilename = `${firstName}_${lastName}_${phone}_${cryptoRandomId}.pdf`;
    const pdfFilename = filename || defaultFilename;
    const outputPath = path.join("uploads", "resumes", pdfFilename);

    const savedPath = await renderHtmlToPdf(htmlContent, outputPath);
    return savedPath;
  } catch (error) {
    if (typeof logError === "function") {
      await logError("resumePdfService.generateResumePdf", error.message);
    }
    throw error;
  }
};
