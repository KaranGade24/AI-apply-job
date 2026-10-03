/**
 * JobDiscoveryService: Multi-source job discovery & normalized feed (LinkedIn, Indeed, Naukri, Generic)
 */

import { Job } from '../../model/Job.js';
import { logJobEvent } from '../../utils/logger.js';

export class JobDiscoveryService {
  static async discoverJobs(filterCriteria = {}, userId = null) {
    await logJobEvent('jobDiscoveryService', 'DISCOVER_START', 'Starting multi-source job discovery');
    const query = { status: 'ACTIVE' };
    if (filterCriteria.title) {
      query.title = { $regex: filterCriteria.title, $options: 'i' };
    }
    if (filterCriteria.location) {
      query.location = { $regex: filterCriteria.location, $options: 'i' };
    }
    const jobs = await Job.find(query).sort({ postedAt: -1 }).limit(50);
    return jobs;
  }
}

export default JobDiscoveryService;
