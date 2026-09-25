import { RESUME_PAGE_COUNT } from "../constant/application.constant.js";

/**
 * Normalizes raw resumeData (from DB or AI tailor graph) into template-friendly format
 * @param {object} resumeData - Raw candidate resume object
 * @returns {object} Template-friendly normalized data
 */
export const prepareResumeData = (resumeData = {}) => {
  const personalInfo = resumeData.personalInfo || resumeData.personal || {};

  const name = personalInfo.fullName || personalInfo.name || "Candidate";
  const headline = personalInfo.headline || personalInfo.title || "";
  const email = personalInfo.email || "";
  const phone = personalInfo.phone || "";
  const location = personalInfo.location || "";
  const linkedinUrl = personalInfo.linkedin || personalInfo.linkedinUrl || "";
  const githubUrl = personalInfo.github || personalInfo.githubUrl || "";
  const websiteUrl = personalInfo.website || personalInfo.portfolio || personalInfo.websiteUrl || "";

  const summary = (resumeData.summary || "").trim();
  const targetPages = resumeData.targetPages || RESUME_PAGE_COUNT;

  // Process Technical & General Skills
  let rawSkillsList = [];
  let categorizedSkills = [];

  if (Array.isArray(resumeData.skills)) {
    rawSkillsList = resumeData.skills;
  } else if (resumeData.skills && typeof resumeData.skills === "object") {
    Object.entries(resumeData.skills).forEach(([categoryKey, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        categorizedSkills.push({
          category: categoryKey,
          itemsText: items.join(", "),
        });
        rawSkillsList.push(...items);
      } else if (typeof items === "string" && items.trim()) {
        categorizedSkills.push({
          category: categoryKey,
          itemsText: items.trim(),
        });
        rawSkillsList.push(...items.split(",").map((s) => s.trim()));
      }
    });
  }

  // Deduplicate flat skills list
  const flatSkills = Array.from(
    new Set(rawSkillsList.map((s) => (typeof s === "string" ? s.trim() : String(s))).filter(Boolean))
  );

  // Experience normalization
  const rawExp = Array.isArray(resumeData.experience)
    ? resumeData.experience
    : Array.isArray(resumeData.workExperience)
    ? resumeData.workExperience
    : [];

  const workExperience = rawExp.map((exp) => ({
    jobTitle: exp.title || exp.role || exp.jobTitle || "",
    company: exp.company || exp.companyName || "",
    startDate: exp.startDate || "",
    endDate: exp.endDate || "",
    dateRange: exp.duration || exp.dates || exp.date || [exp.startDate, exp.endDate].filter(Boolean).join(" – "),
    location: exp.location || "",
    description: exp.description || "",
    highlights: Array.isArray(exp.highlights) ? exp.highlights.filter(Boolean) : [],
    technologiesText: Array.isArray(exp.technologies)
      ? exp.technologies.join(", ")
      : typeof exp.technologies === "string"
      ? exp.technologies
      : "",
  }));

  // Projects normalization with complete link extractions
  const rawProjects = Array.isArray(resumeData.projects) ? resumeData.projects : [];
  const projects = rawProjects.map((proj) => {
    const techArray = Array.isArray(proj.technologies)
      ? proj.technologies
      : typeof proj.technologies === "string"
      ? proj.technologies.split(",").map((t) => t.trim())
      : [];

    const githubUrl = proj.links?.github || proj.githubUrl || proj.github || "";
    const demoUrl = proj.links?.liveDemo || proj.links?.demo || proj.demoUrl || proj.liveDemo || "";

    return {
      name: proj.title || proj.name || "",
      description: proj.description || "",
      technologiesText: techArray.join(", "),
      highlights: Array.isArray(proj.highlights) ? proj.highlights.filter(Boolean) : [],
      githubUrl,
      demoUrl,
      dateRange: proj.date || proj.dates || proj.duration || proj.dateRange || "",
    };
  });

  // Education normalization
  const rawEdu = Array.isArray(resumeData.education) ? resumeData.education : [];
  const education = rawEdu.map((edu) => ({
    degree: edu.degree || "",
    fieldOfStudy: edu.fieldOfStudy || edu.field || "",
    degreeFull: edu.degreeFull || [edu.degree, edu.fieldOfStudy].filter(Boolean).join(", "),
    institution: edu.institution || edu.school || edu.university || "",
    location: edu.location || "",
    graduationYear: edu.graduationYear || edu.year || edu.dates || "",
    cgpa: edu.cgpa || edu.gpa || "",
  }));

  // Certifications normalization
  const rawCerts = Array.isArray(resumeData.certifications) ? resumeData.certifications : [];
  const certifications = rawCerts.map((cert) => ({
    name: cert.title || cert.name || "",
    organization: cert.organization || cert.issuer || "",
    issueDate: cert.issueDate || cert.year || cert.date || "",
    url: cert.url || cert.link || "",
  }));

  return {
    name,
    headline,
    email,
    phone,
    location,
    linkedinUrl,
    githubUrl,
    websiteUrl,
    summary,
    targetPages,
    scaleMultiplier: resumeData.scaleMultiplier || 1.0,
    flatSkills,
    categorizedSkills,
    workExperience,
    projects,
    education,
    certifications,
    hasSummary: Boolean(summary),
    hasSkills: flatSkills.length > 0 || categorizedSkills.length > 0,
    hasExperience: workExperience.length > 0,
    hasProjects: projects.length > 0,
    hasEducation: education.length > 0,
    hasCertifications: certifications.length > 0,
  };
};
