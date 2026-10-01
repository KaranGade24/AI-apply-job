import * as agentRunnerService from "../services/agentRunner.service.js";
import {
  submitAnswersRequestSchema,
  confirmReviewRequestSchema,
} from "../agent/schema/agentStateSchema.js";
import { appError } from "../utils/errors.js";

/**
 * POST /api/applications/:id/start
 * Starts or advances the autonomous browser agent workflow.
 */
export const startApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.startApplicationWorkflow(
      id,
      userId,
      req.body || {},
    );
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications/:id/status
 * Retrieves the current automation state and workflow progress.
 */
export const getStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.getWorkflowStatus(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications/:id/questions
 * Retrieves pending human-in-the-loop questions requiring candidate answer.
 */
export const getQuestions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.getWorkflowQuestions(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/answers
 * Submits user answers to pending questions and resumes paused LangGraph workflow.
 */
export const submitAnswers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const parsed = submitAnswersRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new appError(
        `Invalid answers payload: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
        400,
      );
    }

    const result = await agentRunnerService.submitWorkflowAnswers(
      id,
      userId,
      parsed.data.answers,
    );
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications/:id/review
 * Retrieves pre-submission application summary and answer verification hash.
 */
export const getReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.getWorkflowReview(id, userId);
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/confirm
 * Confirms candidate pre-submission review approval and resumes graph to submit application.
 */
export const confirmReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const parsed = confirmReviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new appError(
        `Invalid review confirmation payload: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
        400,
      );
    }

    const result = await agentRunnerService.confirmWorkflowReview(
      id,
      userId,
      parsed.data,
    );
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/cancel
 * Cancels active browser workflow execution.
 */
export const cancelApplication = async (req, res, next) => {
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

export default {
  startApplication,
  getStatus,
  getQuestions,
  submitAnswers,
  getReview,
  confirmReview,
  cancelApplication,
};
