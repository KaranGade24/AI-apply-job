import path from "path";
import crypto from "crypto";
import { renderHtmlToPdf } from "./pdfRenderer.js";
import { RESUME_PDF_TEMPLATES } from "../constant/application.constant.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";
import { findUserById, findUserProfileByUserId } from "../repositories/user.repository.js";

/**
 * Builds HTML document from structured resume data
 * @param {object} resumeData
 * @param {string} template
 * @returns {string} HTML string
 */
export const buildResumeHtml = (resumeData = {}, template = RESUME_PDF_TEMPLATES.MODERN) => {
  const personalInfo = resumeData.personalInfo || resumeData.personal || {};
  const name = personalInfo.fullName || personalInfo.name || "Candidate Name";
  const email = personalInfo.email || "";
  const phone = personalInfo.phone || "";
  const location = personalInfo.location || "";
  const linkedin = personalInfo.linkedin || "";
  const github = personalInfo.github || "";

  const summary = resumeData.summary || "";

  // Extract skills
  let skillsList = [];
  if (Array.isArray(resumeData.skills)) {
    skillsList = resumeData.skills;
  } else if (resumeData.skills && typeof resumeData.skills === "object") {
    skillsList = [
      ...(resumeData.skills.technicalSkills || []),
      ...(resumeData.skills.softSkills || []),
      ...(resumeData.skills.toolsAndFrameworks || []),
    ];
  }

  const experience = Array.isArray(resumeData.experience) ? resumeData.experience : [];
  const projects = Array.isArray(resumeData.projects) ? resumeData.projects : [];
  const education = Array.isArray(resumeData.education) ? resumeData.education : [];

  const primaryColor =
    template === RESUME_PDF_TEMPLATES.MINIMAL ? "#334155" : template === RESUME_PDF_TEMPLATES.ATS ? "#000000" : "#2563eb";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name} - Resume</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Arial', sans-serif; color: #1e293b; line-height: 1.5; font-size: 12px; background: #ffffff; padding: 24px; }
    header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #0f172a; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; }
    .contact-info { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #475569; margin-top: 4px; }
    section { margin-bottom: 16px; }
    h2 { font-size: 13px; text-transform: uppercase; color: ${primaryColor}; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; font-weight: 700; }
    p { font-size: 11px; color: #334155; }
    .skills-container { display: flex; flex-wrap: wrap; gap: 6px; }
    .skill-badge { background: #f8fafc; color: #1e293b; padding: 3px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #cbd5e1; font-weight: 500; }
    .item { margin-bottom: 10px; }
    .item-header { display: flex; justify-content: space-between; font-weight: 700; color: #0f172a; font-size: 12px; }
    .item-sub { color: #64748b; font-size: 11px; margin-bottom: 4px; font-style: italic; }
    ul { padding-left: 18px; font-size: 11px; color: #334155; }
    li { margin-bottom: 3px; }
  </style>
</head>
<body>
  <header>
    <h1>${name}</h1>
    <div class="contact-info">
      ${email ? `<span>📧 ${email}</span>` : ""}
      ${phone ? `<span>📱 ${phone}</span>` : ""}
      ${location ? `<span>📍 ${location}</span>` : ""}
      ${linkedin ? `<span>🔗 ${linkedin}</span>` : ""}
      ${github ? `<span>💻 ${github}</span>` : ""}
    </div>
  </header>

  ${summary ? `<section><h2>Professional Summary</h2><p>${summary}</p></section>` : ""}

  ${
    skillsList.length > 0
      ? `<section><h2>Technical Skills</h2><div class="skills-container">${skillsList
          .map((s) => `<span class="skill-badge">${s}</span>`)
          .join("")}</div></section>`
      : ""
  }

  ${
    experience.length > 0
      ? `<section><h2>Professional Experience</h2>${experience
          .map(
            (exp) => `<div class="item">
            <div class="item-header">
              <span>${exp.title || exp.role || "Role"} ${exp.company ? `- ${exp.company}` : ""}</span>
              <span>${exp.duration || exp.dates || ""}</span>
            </div>
            ${exp.location ? `<div class="item-sub">${exp.location}</div>` : ""}
            ${
              Array.isArray(exp.highlights) && exp.highlights.length > 0
                ? `<ul>${exp.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>`
                : exp.description
                ? `<p>${exp.description}</p>`
                : ""
            }
          </div>`
          )
          .join("")}</section>`
      : ""
  }

  ${
    projects.length > 0
      ? `<section><h2>Key Projects</h2>${projects
          .map(
            (proj) => `<div class="item">
            <div class="item-header">
              <span>${proj.title || proj.name || "Project"}</span>
              ${
                proj.technologies
                  ? `<span>Tech: ${Array.isArray(proj.technologies) ? proj.technologies.join(", ") : proj.technologies}</span>`
                  : ""
              }
            </div>
            ${proj.description ? `<p style="margin-top:2px;">${proj.description}</p>` : ""}
            ${
              Array.isArray(proj.highlights) && proj.highlights.length > 0
                ? `<ul>${proj.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>`
                : ""
            }
          </div>`
          )
          .join("")}</section>`
      : ""
  }

  ${
    education.length > 0
      ? `<section><h2>Education</h2>${education
          .map(
            (edu) => `<div class="item">
            <div class="item-header">
              <span>${edu.degree || "Degree"} ${edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ""}</span>
              <span>${edu.graduationYear || edu.year || edu.dates || ""}</span>
            </div>
            <div class="item-sub">${edu.institution || edu.school || ""}</div>
          </div>`
          )
          .join("")}</section>`
      : ""
  }
</body>
</html>`;
};

/**
 * Generates a tailored PDF resume from structured JSON data
 * @param {object} params
 * @param {object} params.resumeData - Tailored structured resume JSON
 * @param {string} [params.template] - Resume PDF template choice ('modern', 'minimal', 'ats')
 * @param {string} [params.filename] - Custom output filename
 * @param {string} [params.userId] - Optional User ID to fetch fallback user profile details
 * @returns {Promise<string>} Output PDF file path
 */
export const generateResumePdf = async ({ resumeData, template = RESUME_PDF_TEMPLATES.MODERN, filename, userId }) => {
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
        // Log DB fetch warning but continue with available resumeData
        await logError("resumePdfService.generateResumePdf.fetchUserInfo", dbErr.message);
      }
    }

    resumeData.personalInfo = personalInfo;

    const htmlContent = buildResumeHtml(resumeData, template);

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
    await logError("resumePdfService.generateResumePdf", error.message);
    throw error;
  }
};
