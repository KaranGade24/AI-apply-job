import { findOriginalResumeByUserId } from '../repositories/resume.repository.js';
import { getJobs, getJobBySourceUrl, saveBulkJobs } from '../repositories/job.repository.js';
import { runJobDiscoveryWorkflow } from '../agent/graph/jobDiscoveryGraph.js';
import { MatchStatus, WorkMode } from '../model/Job.js';
import { appError } from '../utils/errors.js';
import { logError, logJobEvent } from '../utils/logger.js';

const SEED_JOBS = [
  {
    title: 'Full Stack Developer (MERN)',
    company: 'TechCorp Solutions',
    location: 'Pune, Maharashtra · Hybrid',
    experienceRequired: '0-2 years',
    description: 'Looking for a passionate MERN stack developer to build scalable web applications and REST APIs.',
    requirements: ['Experience with React.js, Node.js, Express, MongoDB', 'Good understanding of JavaScript and RESTful APIs'],
    skills: ['React', 'Node.js', 'MongoDB', 'Express', 'JavaScript', 'Tailwind CSS'],
    applicationUrl: 'https://techcorp.example.com/careers/mern-developer',
    hrEmail: 'hr@techcorp.example.com',
    sourceUrl: 'https://techcorp.example.com/careers/mern-developer',
    source: 'Company Portal',
    workMode: WorkMode.HYBRID,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 95,
    matchReason: 'High skill alignment with React, Node.js, Express, and MongoDB.'
  },
  {
    title: 'Senior Frontend Developer',
    company: 'InnovateLabs Technologies',
    location: 'Bengaluru, Karnataka · Remote',
    experienceRequired: '1-3 years',
    description: 'Build modern user interfaces with React, Vite, and Tailwind CSS.',
    requirements: ['Strong React.js and modern JavaScript skills', 'State management with Redux/Zustand'],
    skills: ['React', 'TypeScript', 'Tailwind CSS', 'Vite', 'Redux'],
    applicationUrl: 'https://innovatelabs.example.com/careers/frontend-dev',
    hrEmail: 'careers@innovatelabs.example.com',
    sourceUrl: 'https://innovatelabs.example.com/careers/frontend-dev',
    source: 'LinkedIn',
    workMode: WorkMode.REMOTE,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 92,
    matchReason: 'Excellent React and frontend architecture matching.'
  },
  {
    title: 'Backend Node.js Engineer',
    company: 'GlobalSoft Systems',
    location: 'Hyderabad, Telangana · Remote',
    experienceRequired: '1-2 years',
    description: 'Design and deploy scalable microservices and database schemas.',
    requirements: ['Node.js, Express, MongoDB, and SQL databases', 'JWT auth and API security best practices'],
    skills: ['Node.js', 'Express.js', 'MongoDB', 'PostgreSQL', 'REST API', 'Docker'],
    applicationUrl: 'https://globalsoft.example.com/careers/backend-node',
    hrEmail: 'jobs@globalsoft.example.com',
    sourceUrl: 'https://globalsoft.example.com/careers/backend-node',
    source: 'Naukri',
    workMode: WorkMode.REMOTE,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 88,
    matchReason: 'Strong backend service and database query match.'
  },
  {
    title: 'React & Next.js Developer',
    company: 'WebSolutions Inc',
    location: 'Remote',
    experienceRequired: '0-1 years',
    description: 'Create responsive, high-performance web interfaces with Next.js.',
    requirements: ['React, Next.js, CSS/Tailwind', 'RESTful API integration'],
    skills: ['React', 'Next.js', 'Tailwind CSS', 'JavaScript'],
    applicationUrl: 'https://websolutions.example.com/careers/react-next',
    hrEmail: 'hiring@websolutions.example.com',
    sourceUrl: 'https://websolutions.example.com/careers/react-next',
    source: 'LinkedIn',
    workMode: WorkMode.REMOTE,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 94,
    matchReason: 'Matches candidate frontend skills and UI preferences.'
  },
  {
    title: 'Full Stack AI Engineer',
    company: 'NextGen AI Labs',
    location: 'Mumbai, Maharashtra · Hybrid',
    experienceRequired: '1-3 years',
    description: 'Integrate LLMs, Gemini API, and React frontends into production platforms.',
    requirements: ['Full stack MERN proficiency', 'Generative AI API integration'],
    skills: ['React', 'Node.js', 'Gemini API', 'MERN Stack', 'Python'],
    applicationUrl: 'https://nextgenai.example.com/careers/ai-engineer',
    hrEmail: 'ai-careers@nextgenai.example.com',
    sourceUrl: 'https://nextgenai.example.com/careers/ai-engineer',
    source: 'Company Portal',
    workMode: WorkMode.HYBRID,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 96,
    matchReason: 'Outstanding match for AI-integrated full stack web applications.'
  },
  {
    title: 'DevOps & Cloud Engineer',
    company: 'CloudScale Networks',
    location: 'Remote',
    experienceRequired: '1-2 years',
    description: 'Manage CI/CD pipelines, Docker containers, and cloud deployment.',
    requirements: ['Docker, Linux, AWS, Node.js deployment'],
    skills: ['Docker', 'AWS', 'Linux', 'Node.js', 'CI/CD'],
    applicationUrl: 'https://cloudscale.example.com/careers/devops',
    hrEmail: 'ops@cloudscale.example.com',
    sourceUrl: 'https://cloudscale.example.com/careers/devops',
    source: 'Naukri',
    workMode: WorkMode.REMOTE,
    employmentType: 'fullTime',
    matchStatus: MatchStatus.MATCHED,
    matchScore: 82,
    matchReason: 'Good alignment with backend deployment and server setup.'
  }
];

/**
 * Service to orchestrate Job Discovery, filtering, and candidate resume matching
 * @param {object} params
 * @param {string} params.userId - Authenticated candidate user ID
 * @param {Array<string>} params.sources - Array of job source adapter names (e.g. ['jobViaReferral', 'naukri'])
 * @param {Array<string>} params.keywords - Job keywords / titles
 * @param {Array<string>} params.locations - Preferred locations
 * @param {object} params.experience - Min and max experience in years
 * @param {Array<string>} params.workMode - Preferred work modes (e.g. ['remote', 'hybrid'])
 * @param {Array<string>} params.employmentType - Employment type (e.g. ['fullTime'])
 * @param {string} params.postedWithin - Time frame window (e.g. '24h')
 * @param {number} params.maxJobs - Maximum matched jobs to retrieve
 */
export const discoverJobsService = async ({
  userId,
  sources = ['jobViaReferral'],
  keywords = ['MERN Developer', 'Node.js Developer'],
  locations = ['Pune', 'Remote'],
  experience = { min: 0, max: 2 },
  workMode = ['remote', 'hybrid', 'workFromOffice'],
  employmentType = ['fullTime'],
  preferredApplicationMethods = ['email', 'googleForm', 'websiteForm', 'phone', 'unknown'],
  postedWithin = '24h',
  maxJobs = 10
}) => {
  try {
    if (!userId) {
      throw new appError('User ID is required for job discovery', 400);
    }

    await logJobEvent('discoverJobsService', 'START', `Initiating job discovery for User: ${userId}`);

    // 1. Fetch user's original candidate resume from MongoDB
    const originalResume = await findOriginalResumeByUserId(userId);

    let candidateResumeText = '';
    if (originalResume && originalResume.parsedData) {
      candidateResumeText = typeof originalResume.parsedData === 'string'
        ? originalResume.parsedData
        : JSON.stringify(originalResume.parsedData);
    }

    // 2. Build search configuration
    const searchConfig = {
      userId,
      sources,
      keywords,
      locations,
      experience,
      workMode,
      employmentType,
      preferredApplicationMethods,
      postedWithin,
      maxJobs,
      candidateResumeText
    };

    // 3. Execute Job Discovery Workflow Graph
    const workflowResult = await runJobDiscoveryWorkflow(searchConfig);

    if (!workflowResult.success && workflowResult.errors?.length > 0) {
      throw new appError(`Job Discovery workflow failed: ${workflowResult.errors.join('; ')}`, 500);
    }

    await logJobEvent('discoverJobsService', 'SUCCESS', `Discovered ${workflowResult.totalJobsDiscovered || 0} jobs, matched ${workflowResult.matchedJobs?.length || 0}`);

    return {
      totalDiscovered: workflowResult.totalJobsDiscovered || 0,
      matchedCount: (workflowResult.matchedJobs || []).length,
      hasCandidateResume: Boolean(candidateResumeText),
      jobs: workflowResult.matchedJobs || []
    };
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    await logError('jobService.discoverJobsService', error.message);
    throw new appError(`Job Discovery Service Error: ${error.message}`, 500);
  }
};

/**
 * Service to retrieve saved jobs from MongoDB
 */
export const getSavedJobsService = async (filter = {}, limit = 50) => {
  try {
    let jobs = await getJobs(filter, limit);
    if (!jobs || jobs.length === 0) {
      await saveBulkJobs(SEED_JOBS);
      jobs = await getJobs(filter, limit);
    }
    return jobs;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to fetch saved jobs: ${error.message}`, 500);
  }
};

export default {
  discoverJobsService,
  getSavedJobsService
};
