import {
  checkGoogleSessionStatusService,
  saveGoogleSessionService,
  disconnectGoogleSessionService,
} from '../services/googleSession.service.js';

/**
 * Get current Google session status for logged in user
 */
export const getStatus = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await checkGoogleSessionStatusService(userId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save Google session cookies / storageState
 */
export const saveSession = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await saveGoogleSessionService(userId, req.body || {});
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disconnect Google session
 */
export const disconnect = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await disconnectGoogleSessionService(userId);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
