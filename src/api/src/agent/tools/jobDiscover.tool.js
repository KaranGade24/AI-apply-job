import { tool } from '@langchain/core/tools';
import { runJobDiscoveryWorkflow } from '../graph/jobDiscoveryGraph.js';
import { searchConfigSchema } from '../schema/jobDiscoverySchema.js';
import { logError } from '../../utils/logger.js';

export const jobDiscoveryTool = tool(
  async (searchConfig) => {
    try {
      const result = await runJobDiscoveryWorkflow(searchConfig);

      return JSON.stringify({
        success: result.success,
        totalJobsDiscovered: result.totalJobsDiscovered,
        totalMatchedJobs: (result.matchedJobs || []).length,
        jobs: (result.matchedJobs || []).map(job => ({
          title: job.title,
          company: job.company,
          location: job.location,
          skills: job.skills,
          matchStatus: job.matchStatus,
          matchScore: job.matchScore,
          matchReason: job.matchReason,
          matchedSkills: job.matchedSkills,
          missingSkills: job.missingSkills,
          sourceUrl: job.sourceUrl,
          postedBy: job.postedBy,
          postedDate: job.postedDate
        })),
        errors: result.errors
      }, null, 2);
    } catch (error) {
      await logError('jobDiscoveryTool', error.message);
      return JSON.stringify({
        success: false,
        error: `Failed to discover jobs: ${error.message}`
      });
    }
  },
  {
    name: 'jobDiscoveryTool',
    description: 'Searches, parses, filters, and matches live job postings from job sources (JobViaReferral, etc.) against candidate criteria and resume.',
    schema: searchConfigSchema
  }
);

export default jobDiscoveryTool;
