import {
  discoverJobsService,
  getSavedJobsService,
  deleteJobService,
} from "../services/job.service.js";
import { handleError } from "../utils/errors.js";

/**
 * Controller to handle POST /api/jobs/discover
 */
export const discoverJobsController = async (req, res) => {
  const abortController = new AbortController();

  req.on('close', () => {
    if (!res.headersSent) {
      abortController.abort();
    }
  });

  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const {
      sources,
      keywords,
      locations,
      experience,
      workMode,
      employmentType,
      excludeKeywords,
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
      excludeKeywords,
      preferredApplicationMethods:
        preferredApplicationMethods || preferredMethods,
      postedWithin,
      maxJobs,
      abortSignal: abortController.signal,
    });

    if (!res.headersSent) {
      return res.status(200).json({
        success: true,
        message: "Job discovery and resume matching completed successfully",
        data: result,
      });
    }
  } catch (error) {
    if (abortController.signal.aborted || error.message?.includes('ABORTED')) {
      if (!res.headersSent) {
        return res.status(499).json({
          success: false,
          message: "Job discovery process cancelled by user",
        });
      }
      return;
    }
    return handleError(error, res);
  }
};

/**
 * Controller to handle GET /api/jobs
 */
export const getSavedJobsController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const query = req.query || {};
    const matchStatus = query.matchStatus;
    const filter = matchStatus ? { matchStatus } : {};
    const limit = parseInt(query.limit || "50", 10);

    const jobs = await getSavedJobsService(filter, limit, userId);

    return res.status(200).json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Controller to handle DELETE /api/jobs/:id
 */
export const deleteJobController = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteJobService(id);
    return res.status(200).json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    return handleError(error, res);
  }
};

export default {
  discoverJobsController,
  getSavedJobsController,
  deleteJobController,
};
