import {
  getNaukriAccountStatus,
  connectNaukriAccount,
  disconnectNaukriAccount,
} from '../services/naukriAccount.service.js';
import { handleError } from '../utils/errors.js';

/**
 * Controller to handle GET /api/naukri/status
 */
export const getNaukriStatusController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const status = await getNaukriAccountStatus(userId);
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Controller to handle POST /api/naukri/connect
 */
export const connectNaukriController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { loginMethod, username, password, storageStateJson } = req.body || {};

    const result = await connectNaukriAccount({
      userId,
      loginMethod,
      username,
      password,
      storageStateJson,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Controller to handle POST /api/naukri/disconnect
 */
export const disconnectNaukriController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await disconnectNaukriAccount(userId);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return handleError(error, res);
  }
};
