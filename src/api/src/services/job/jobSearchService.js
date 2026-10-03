/**
 * JobSearchService: Query and filter discovered jobs with user criteria
 */

import { Job } from '../../model/Job.js';

export class JobSearchService {
  static async search(params = {}) {
    const { keyword, location, workMode, minSalary, maxSalary, skills } = params;
    const query = { status: 'ACTIVE' };

    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { company: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
      ];
    }
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }
    if (workMode && workMode !== 'all') {
      query.workMode = workMode;
    }

    return await Job.find(query).sort({ postedAt: -1 }).limit(100);
  }
}

export default JobSearchService;
