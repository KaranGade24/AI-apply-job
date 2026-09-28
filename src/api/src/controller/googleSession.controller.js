import {
  checkGoogleSessionStatusService,
  saveGoogleSessionService,
  loginWithGoogleCredentialsService,
  launchGoogleInteractiveLoginService,
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
 * Direct Google account login with email & password (one-time browser sign-in)
 */
export const login = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { email, password, otpCode } = req.body || {};
    const result = await loginWithGoogleCredentialsService(userId, {
      email,
      password,
      otpCode,
    });
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
 * Launches a Playwright browser window for user to log in manually,
 * then automatically saves session cookies and closes window.
 */
export const launchInteractiveLogin = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await launchGoogleInteractiveLoginService(userId);
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
