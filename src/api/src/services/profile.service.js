import { UserProfile } from '../model/UserProfile.js';
import { Resume, ResumeType } from '../model/Resume.js';
import { appError } from '../utils/errors.js';
import { logJobEvent, logError } from '../utils/logger.js';

/**
 * Get or create User Profile
 */
export const getUserProfileService = async (userId) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }

  let profile = await UserProfile.findOne({ userId });
  if (!profile) {
    profile = await UserProfile.create({
      userId,
      personal: {},
      education: [],
      experience: [],
      skills: [],
      projects: [],
      links: {},
      applicationAnswers: {},
      preferences: {},
    });
  }
  return profile;
};

/**
 * Update User Profile
 */
export const updateUserProfileService = async (userId, updateData = {}) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }

  const profile = await getUserProfileService(userId);

  if (updateData.personal) {
    profile.personal = { ...profile.personal.toObject(), ...updateData.personal };
  }
  if (Array.isArray(updateData.education)) {
    profile.education = updateData.education;
  }
  if (Array.isArray(updateData.experience)) {
    profile.experience = updateData.experience;
  }
  if (Array.isArray(updateData.skills)) {
    profile.skills = updateData.skills;
  }
  if (updateData.categorizedSkills) {
    profile.categorizedSkills = {
      ...profile.categorizedSkills.toObject(),
      ...updateData.categorizedSkills,
    };
  }
  if (Array.isArray(updateData.projects)) {
    profile.projects = updateData.projects;
  }
  if (updateData.links) {
    profile.links = { ...profile.links.toObject(), ...updateData.links };
  }
  if (updateData.applicationAnswers) {
    const existing = profile.applicationAnswers?.toObject() || {};
    profile.applicationAnswers = { ...existing, ...updateData.applicationAnswers };
  }
  if (updateData.preferences) {
    profile.preferences = { ...profile.preferences.toObject(), ...updateData.preferences };
  }

  await profile.save();
  logJobEvent('profile', 'UPDATED', `User profile updated for user ${userId}`, 'low');
  return profile;
};

/**
 * Save or update a single reusable answer
 */
export const saveReusableAnswerService = async (userId, answerData = {}) => {
  const { questionKey, questionText, answerText, category = 'general' } = answerData;
  if (!questionKey || answerText === undefined) {
    throw new appError('questionKey and answerText are required', 400);
  }

  const profile = await getUserProfileService(userId);
  const currentAnswers = profile.applicationAnswers?.customAnswers || [];

  const existingIdx = currentAnswers.findIndex((a) => a.questionKey === questionKey);
  if (existingIdx !== -1) {
    currentAnswers[existingIdx].answerText = answerText;
    currentAnswers[existingIdx].questionText = questionText || currentAnswers[existingIdx].questionText;
    currentAnswers[existingIdx].category = category;
    currentAnswers[existingIdx].updatedAt = new Date();
  } else {
    currentAnswers.push({
      questionKey,
      questionText: questionText || questionKey,
      answerText,
      category,
      updatedAt: new Date(),
    });
  }

  profile.applicationAnswers.customAnswers = currentAnswers;

  // Also update top-level standard fields if recognized
  if (questionKey === 'workAuthorization') profile.applicationAnswers.workAuthorization = answerText;
  if (questionKey === 'requiresSponsorship') profile.applicationAnswers.requiresSponsorship = Boolean(answerText);
  if (questionKey === 'noticePeriod') profile.applicationAnswers.noticePeriod = answerText;
  if (questionKey === 'expectedSalary') profile.applicationAnswers.expectedSalary = answerText;
  if (questionKey === 'currentSalary') profile.applicationAnswers.currentSalary = answerText;
  if (questionKey === 'willingToRelocate') profile.applicationAnswers.willingToRelocate = answerText;
  if (questionKey === 'preferredWorkMode') profile.applicationAnswers.preferredWorkMode = answerText;
  if (questionKey === 'yearsOfExperience') profile.applicationAnswers.yearsOfExperience = answerText;

  await profile.save();
  return profile.applicationAnswers;
};

/**
 * Sync profile from latest parsed resume without hallucination
 */
export const syncProfileFromResumeService = async (userId) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }

  const resume = await Resume.findOne({ userId, type: ResumeType.ORIGINAL }).sort({ updatedAt: -1 });
  if (!resume || !resume.parsedData) {
    throw new appError('No parsed resume found to sync from. Please upload a resume first.', 404);
  }

  const parsed = resume.parsedData;
  const profile = await getUserProfileService(userId);

  // Sync Personal Info
  if (parsed.personalInfo) {
    const p = parsed.personalInfo;
    profile.personal = {
      ...profile.personal.toObject(),
      fullName: p.name || profile.personal.fullName,
      email: p.email || profile.personal.email,
      phone: p.phone || profile.personal.phone,
      location: p.location || profile.personal.location,
      headline: p.title || p.headline || profile.personal.headline,
      summary: parsed.summary || profile.personal.summary,
    };
    if (p.linkedin) profile.links.linkedin = p.linkedin;
    if (p.github) profile.links.github = p.github;
    if (p.portfolio || p.website) profile.links.portfolio = p.portfolio || p.website;
  }

  // Sync Experience
  if (Array.isArray(parsed.experience) && parsed.experience.length > 0) {
    profile.experience = parsed.experience.map((exp) => ({
      company: exp.company || '',
      position: exp.position || exp.role || '',
      employmentType: exp.employmentType || 'full-time',
      startDate: exp.startDate || '',
      endDate: exp.endDate || '',
      current: exp.current || exp.isCurrent || false,
      location: exp.location || '',
      description: exp.description || (Array.isArray(exp.highlights) ? exp.highlights.join('\n') : ''),
      skills: Array.isArray(exp.skills) ? exp.skills : [],
    }));
  }

  // Sync Education
  if (Array.isArray(parsed.education) && parsed.education.length > 0) {
    profile.education = parsed.education.map((edu) => ({
      degree: edu.degree || '',
      institution: edu.institution || edu.school || edu.college || '',
      fieldOfStudy: edu.fieldOfStudy || edu.major || '',
      graduationYear: edu.graduationYear || edu.year || '',
      gpa: edu.gpa || edu.score || '',
      description: edu.description || '',
    }));
  }

  // Sync Skills
  if (Array.isArray(parsed.skills)) {
    const rawSkills = parsed.skills.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
    const combined = Array.from(new Set([...(profile.skills || []), ...rawSkills]));
    profile.skills = combined;
  }

  // Sync Projects
  if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
    profile.projects = parsed.projects.map((proj) => ({
      name: proj.name || proj.title || '',
      description: proj.description || '',
      technologies: Array.isArray(proj.technologies) ? proj.technologies : [],
      githubUrl: proj.githubUrl || proj.link || '',
      liveUrl: proj.liveUrl || '',
      responsibilities: Array.isArray(proj.responsibilities) ? proj.responsibilities : [],
      keyAchievements: Array.isArray(proj.achievements) ? proj.achievements : [],
    }));
  }

  await profile.save();
  logJobEvent('profile', 'SYNCED_RESUME', `Synchronized profile for user ${userId} from resume`, 'low');
  return profile;
};
