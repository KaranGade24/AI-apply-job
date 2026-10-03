/**
 * PersonalizationService: Generates job-tailored cover letters and application materials
 */

import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env.js';

export class PersonalizationService {
  static async generateCoverLetter(job = {}, userProfile = {}) {
    const candidateName = userProfile.personalInfo?.fullName || 'Applicant';
    const company = job.company || 'the hiring team';
    const role = job.title || 'the role';

    return `Dear Hiring Manager at ${company},\n\nI am writing to express my strong interest in the ${role} position. With my background in ${userProfile.skills?.slice(0, 3).join(', ') || 'software development'} and experience building scalable web solutions, I am confident in my ability to contribute effectively to your team.\n\nThank you for your consideration.\n\nBest regards,\n${candidateName}`;
  }
}

export default PersonalizationService;
