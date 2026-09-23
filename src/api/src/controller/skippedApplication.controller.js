import { getUserSkippedApplicationsService } from '../services/skippedApplication.service.js';
import { handleError } from '../utils/errors.js';

/**
 * Controller to handle GET /api/skipped-applications
 */
export const getSkippedApplicationsController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { skipReason, page, limit } = req.query || {};

    const result = await getUserSkippedApplicationsService(userId, {
      skipReason,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      message: 'Skipped applications retrieved successfully',
      data: result.skipped,
      pagination: {
        total: result.total,
        page: parseInt(page || '1', 10),
        limit: parseInt(limit || '50', 10)
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

export default {
  getSkippedApplicationsController
};
