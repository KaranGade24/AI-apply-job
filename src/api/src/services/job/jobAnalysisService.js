/**
 * JobAnalysisService: Deep-dive analysis of job descriptions and requirements
 */

import { generateJobMatchService } from '../job.service.js';

export class JobAnalysisService {
  static async analyzeJobWithProfile(job, userProfile) {
    return await generateJobMatchService(job, userProfile);
  }
}

export default JobAnalysisService;
