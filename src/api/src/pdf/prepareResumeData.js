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

  // Process Technical & General Skills
  let rawSkillsList = [];
  let categorizedSkills = [];

  if (Array.isArray(resumeData.skills)) {
    rawSkillsList = resumeData.skills;
  } else if (resumeData.skills && typeof resumeData.skills === "object") {
    if (Array.isArray(resumeData.skills.technicalSkills) && resumeData.skills.technicalSkills.length > 0) {
      categorizedSkills.push({
        category: "Technical Skills",
        itemsText: resumeData.skills.technicalSkills.join(", "),
      });
      rawSkillsList.push(...resumeData.skills.technicalSkills);
    }
    if (Array.isArray(resumeData.skills.toolsAndFrameworks) && resumeData.skills.toolsAndFrameworks.length > 0) {
      categorizedSkills.push({
        category: "Tools & Frameworks",
        itemsText: resumeData.skills.toolsAndFrameworks.join(", "),
      });
      rawSkillsList.push(...resumeData.skills.toolsAndFrameworks);
    }
    if (Array.isArray(resumeData.skills.softSkills) && resumeData.skills.softSkills.length > 0) {
      categorizedSkills.push({
        category: "Soft Skills",
        itemsText: resumeData.skills.softSkills.join(", "),
      });
      rawSkillsList.push(...resumeData.skills.softSkills);
    }
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
    dateRange: exp.duration || exp.dates || [exp.startDate, exp.endDate].filter(Boolean).join(" – "),
    location: exp.location || "",
    description: exp.description || "",
    highlights: Array.isArray(exp.highlights) ? exp.highlights.filter(Boolean) : [],
    technologiesText: Array.isArray(exp.technologies)
      ? exp.technologies.join(", ")
      : typeof exp.technologies === "string"
      ? exp.technologies
      : "",
  }));

  // Projects normalization
  const rawProjects = Array.isArray(resumeData.projects) ? resumeData.projects : [];
  const projects = rawProjects.map((proj) => {
    const techArray = Array.isArray(proj.technologies)
      ? proj.technologies
      : typeof proj.technologies === "string"
      ? proj.technologies.split(",").map((t) => t.trim())
      : [];

    return {
      name: proj.title || proj.name || "",
      description: proj.description || "",
      technologiesText: techArray.join(" · "),
      highlights: Array.isArray(proj.highlights) ? proj.highlights.filter(Boolean) : [],
      githubUrl: proj.links?.github || proj.githubUrl || proj.github || "",
      demoUrl: proj.links?.liveDemo || proj.links?.demo || proj.demoUrl || proj.liveDemo || "",
    };
  });

  // Education normalization
  const rawEdu = Array.isArray(resumeData.education) ? resumeData.education : [];
  const education = rawEdu.map((edu) => ({
    degree: edu.degree || "",
    fieldOfStudy: edu.fieldOfStudy || edu.field || "",
    degreeFull: [edu.degree, edu.fieldOfStudy].filter(Boolean).join(" in "),
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
