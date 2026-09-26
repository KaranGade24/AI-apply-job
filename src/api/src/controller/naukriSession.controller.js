import {
  connectNaukriService,
  saveManualLoginService,
  getNaukriSessionStatusService,
  disconnectNaukriService,
} from "../services/naukriSession.service.js";
import { logJobEvent, logError } from "../utils/logger.js";

/**
 * Controller to initiate or verify Naukri connection (Step 1 flow)
 */
export const connectNaukriController = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    await logJobEvent(
      "connectNaukriController",
      "REQ",
      `Connect request for user: ${userId}`,
    );

    const result = await connectNaukriService(userId);
    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    await logError(
      "naukriSessionController.connectNaukriController",
      error.message,
    );
    next(error);
  }
};

/**
 * Controller to retrieve Naukri session status
 */
export const getNaukriStatusController = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.query?.userId;
    const status = await getNaukriSessionStatusService(userId);

    return res.status(200).json({
      status: "success",
      data: status,
    });
  } catch (error) {
    await logError(
      "naukriSessionController.getNaukriStatusController",
      error.message,
    );
    next(error);
  }
};

/**
 * Controller to save manual login / imported session
 */
export const saveManualLoginController = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.body?.userId;
    const { storageState, cookies, oneTimeLogin } = req.body;

    const result = await saveManualLoginService(userId, {
      storageState,
      cookies,
      oneTimeLogin,
    });

    return res.status(200).json({
      status: "success",
      message: "Naukri session captured and stored encrypted.",
      data: result,
    });
  } catch (error) {
    await logError(
      "naukriSessionController.saveManualLoginController",
      error.message,
    );
    next(error);
  }
};

/**
 * Controller to disconnect Naukri session
 */
export const disconnectNaukriController = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.body?.userId;
    const result = await disconnectNaukriService(userId);

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    await logError(
      "naukriSessionController.disconnectNaukriController",
      error.message,
    );
    next(error);
  }
};

export default {
  connectNaukriController,
  getNaukriStatusController,
  saveManualLoginController,
  disconnectNaukriController,
};
