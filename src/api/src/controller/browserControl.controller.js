import * as browserControlService from "../services/browserControl.service.js";
import * as agentRunnerService from "../services/agentRunner.service.js";
import { appError } from "../utils/errors.js";

/**
 * POST /api/applications/:id/agent/take-control
 * Human user takes control of the embedded live browser.
 */
export const takeControl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await browserControlService.takeControlService(id, userId, req.body?.targetUrl);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/return-control
 * Returns control from human back to the autonomous AI agent.
 */
export const returnControl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await browserControlService.returnControlService(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/resume
 * "I'm Done — Resume AI": Verifies challenge is completed, then resumes AI automation.
 */
export const resumeAfterVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await browserControlService.resumeAfterVerificationService(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/pause
 * Pauses active automation.
 */
export const pauseAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await browserControlService.takeControlService(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/stop
 * Stops and cancels active automation.
 */
export const stopAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.cancelWorkflow(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/browser-action
 * Dispatches remote user input (click, mouseMove, wheel, keydown, type, etc.) to the live page.
 */
export const dispatchAction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const action = req.body;
    if (!action || !action.type) {
      throw new appError("Action object with type is required", 400);
    }

    const result = await browserControlService.dispatchUserActionService(id, userId, action);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications/:id/agent/browser-frame
 * Retrieves the latest screencast frame and status for polling or single-frame inspection.
 */
export const getBrowserFrame = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await browserControlService.getBrowserFrameService(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

export default {
  takeControl,
  returnControl,
  resumeAfterVerification,
  pauseAgent,
  stopAgent,
  dispatchAction,
  getBrowserFrame,
};
