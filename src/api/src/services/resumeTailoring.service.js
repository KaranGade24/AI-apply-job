import { getGeminiModel } from "../agent/config/modelConfig.js";
import { tailoredResumeSchema } from "../agent/schema/tailoredResumeSchema.js";
import {
  RESUME_TAILORING_SYSTEM_PROMPT,
  buildResumeTailoringPrompt,
} from "../agent/prompt/resumeTailoring.js";
import { generateResumePdf } from "../pdf/resumePdfService.js";
import { updateApplicationResume } from "../repositories/application.repository.js";
import { RESUME_PAGE_COUNT, resolveUserResumeSettings } from "../constant/application.constant.js";
import { logError, logJobEvent } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Tailors a candidate's resume to match a specific job description and generates an ATS-friendly PDF.
 * This is invoked on-demand when an application method requires a tailored resume (e.g. email,
 * custom form with resume upload field, or Google Form with file upload).
 *
 * @param {object} params
 * @param {object} params.candidateResume - Base parsed resume data
 * @param {object} params.jobDetails - Job document / description
 * @param {string} params.userId - User ID
 * @param {string} [params.applicationId] - Application ID to persist to DB
 * @param {number} [params.targetPageLength] - Target PDF page count (1 or 2)
 * @param {string} [params.template] - PDF template name
 * @returns {Promise<{ tailoredResume: object, pdfPath: string, resumeStrategy: string }>}
 */
export const tailorResumeForJobDescription = async ({
  candidateResume,
  jobDetails,
  userId,
  applicationId = null,
  targetPageLength = null,
  template = null,
}) => {
  try {
    if (!candidateResume) {
      throw new appError("Candidate resume data is required for tailoring", 400);
    }
    if (!jobDetails) {
      throw new appError("Job details are required for resume tailoring", 400);
    }

    await logJobEvent(
      "resumeTailoringService",
      "TAILOR_START",
      `Tailoring resume on demand for job: ${jobDetails.title || "Job"} at ${jobDetails.company || "Company"}`
    );

    // Resolve user dynamic settings
    const userSettings = await resolveUserResumeSettings(userId);
    const effectivePageCount = targetPageLength || userSettings.pageCount || RESUME_PAGE_COUNT;
    const effectiveTemplate = template || userSettings.template || "ATS Modern";

    const model = await getGeminiModel(userId);
    const structuredLlm = model.withStructuredOutput(tailoredResumeSchema);

    const promptText = buildResumeTailoringPrompt({
      candidateResume,
      jobDetails,
      targetPageLength: effectivePageCount,
    });

    let result;
    try {
      result = await structuredLlm.invoke([
        { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ]);
    } catch (llmError) {
      await logError("resumeTailoringService.llm", llmError.message);
      const baseResume = candidateResume || {};
      const basePersonal = baseResume.personalInfo || baseResume.personal || {};
      const safeBaseSkills = Array.isArray(baseResume.skills)
        ? baseResume.skills
        : (typeof baseResume.skills === "string" ? [baseResume.skills] : []);

      result = {
        tailoredResume: {
          personalInfo: basePersonal,
          summary: baseResume.summary || (safeBaseSkills.length > 0 ? `Experienced software engineer skilled in ${safeBaseSkills.slice(0, 5).join(", ")}.` : "Experienced software engineer with a strong track record of technical achievements."),
          skills: safeBaseSkills,
          experience: baseResume.experience || [],
          education: baseResume.education || [],
          projects: baseResume.projects || [],
        },
        resumeStrategy: "Original candidate resume content strictly preserved",
        error: llmError.message,
      };
    }

    const tailored = result.tailoredResume || {};
    const baseResume = candidateResume || {};

    // Merge & preserve personal info and links strictly from original base resume
    const basePersonal = baseResume.personalInfo || baseResume.personal || {};
    const tailoredPersonal = tailored.personalInfo || {};

    let resolvedFullName = basePersonal.fullName || basePersonal.name || tailoredPersonal.fullName;
    if (!resolvedFullName || resolvedFullName === "Candidate" || resolvedFullName === "Candidate Resume") {
      if (userId) {
        const { findUserProfileByUserId, findUserById } = await import("../repositories/user.repository.js");
        const uProfile = await findUserProfileByUserId(userId).catch(() => null);
        const uRecord = await findUserById(userId).catch(() => null);
        if (uProfile?.personal?.firstName || uProfile?.personal?.lastName) {
          resolvedFullName = `${uProfile.personal.firstName || ''} ${uProfile.personal.lastName || ''}`.trim();
        } else if (uProfile?.fullName && uProfile.fullName !== "Candidate") {
          resolvedFullName = uProfile.fullName;
        } else if (uRecord?.username && uRecord.username !== "Candidate") {
          resolvedFullName = uRecord.username;
        }
      }
    }
    if (!resolvedFullName) resolvedFullName = "Candidate";

    tailored.personalInfo = {
      ...tailoredPersonal,
      fullName: resolvedFullName,
      firstName: basePersonal.firstName || tailoredPersonal.firstName || "",
      lastName: basePersonal.lastName || tailoredPersonal.lastName || "",
      phone: basePersonal.phone || basePersonal.contactNo || basePersonal.phoneNumber || tailoredPersonal.phone || "",
      email: basePersonal.email || tailoredPersonal.email || "",
      location: basePersonal.location || basePersonal.address || tailoredPersonal.location || "",
      linkedin:
        basePersonal.linkedin ||
        basePersonal.linkedinUrl ||
        tailoredPersonal.linkedin ||
        "",
      github:
        basePersonal.github ||
        basePersonal.githubUrl ||
        tailoredPersonal.github ||
        "",
      website:
        basePersonal.website ||
        basePersonal.portfolio ||
        basePersonal.websiteUrl ||
        tailoredPersonal.website ||
        tailoredPersonal.portfolio ||
        "",
    };

    // Merge & preserve project links from base resume
    const baseProjects = Array.isArray(baseResume.projects) ? baseResume.projects : [];
    const tailoredProjects = Array.isArray(tailored.projects) ? tailored.projects : [];

    tailored.projects = tailoredProjects.map((proj) => {
      const match =
        baseProjects.find((b) => {
          const bTitle = (b.title || b.name || "").toLowerCase();
          const pTitle = (proj.title || proj.name || "").toLowerCase();
          return bTitle && pTitle && (bTitle.includes(pTitle) || pTitle.includes(bTitle));
        }) || {};

      const github =
        proj.links?.github || proj.githubUrl || proj.github ||
        match.links?.github || match.githubUrl || match.github || "";
      const liveDemo =
        proj.links?.liveDemo || proj.links?.demo || proj.demoUrl || proj.liveDemo ||
        match.links?.liveDemo || match.links?.demo || match.demoUrl || match.liveDemo || "";

      return {
        ...proj,
        links: { github, liveDemo },
        githubUrl: github,
        demoUrl: liveDemo,
      };
    });

    // Generate ATS-friendly PDF
    const pdfPath = await generateResumePdf({
      resumeData: tailored,
      template: effectiveTemplate,
      filename: `tailored-resume-${Date.now()}.pdf`,
      userId,
      targetPages: effectivePageCount,
    });

    // Persist to MongoDB if applicationId is provided
    if (applicationId) {
      await updateApplicationResume(applicationId, {
        tailoredResumeData: tailored,
        pdfPath,
      });
    }

    await logJobEvent(
      "resumeTailoringService",
      "TAILOR_COMPLETE",
      `Successfully tailored resume and generated PDF at ${pdfPath}`
    );

    return {
      tailoredResume: tailored,
      pdfPath,
      resumeStrategy: result.resumeStrategy || "",
    };
  } catch (error) {
    await logError("resumeTailoringService.tailorResumeForJobDescription", error.message);
    throw error;
  }
};
