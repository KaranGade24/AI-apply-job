import {
  discoverJobsService,
  getSavedJobsService,
} from "../services/job.service.js";
import { handleError } from "../utils/errors.js";

/**
 * Controller to handle POST /api/jobs/discover
 */
export const discoverJobsController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;

    const {
      sources,
      keywords,
      locations,
      experience,
      workMode,
      employmentType,
      preferredApplicationMethods,
      preferredMethods,
      postedWithin,
      maxJobs,
    } = req.body || {};

    const result = await discoverJobsService({
      userId,
      sources,
      keywords,
      locations,
      experience,
      workMode,
      employmentType,
      preferredApplicationMethods: preferredApplicationMethods || preferredMethods,
      postedWithin,
      maxJobs,
    });

    return res.status(200).json({
      success: true,
      message: "Job discovery and resume matching completed successfully",
      data: result,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Controller to handle GET /api/jobs
 */
export const getSavedJobsController = async (req, res) => {
  try {
    const query = req.query || {};
    const matchStatus = query.matchStatus;
    const filter = matchStatus ? { matchStatus } : {};
    const limit = parseInt(query.limit || "50", 10);

    const jobs = await getSavedJobsService(filter, limit);

    return res.status(200).json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

export default {
  discoverJobsController,
  getSavedJobsController,
};
