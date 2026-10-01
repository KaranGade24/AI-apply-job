import * as agentRunnerService from "../services/agentRunner.service.js";
import {
  submitAnswersRequestSchema,
  confirmReviewRequestSchema,
} from "../agent/schema/agentStateSchema.js";
import { appError } from "../utils/errors.js";

/**
 * POST /api/applications/:id/agent/start
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
 * GET /api/applications/:id/agent/status
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
 * GET /api/applications/:id/agent/questions
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
 * POST /api/applications/:id/agent/answers
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
 * GET /api/applications/:id/agent/review
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
 * PATCH /api/applications/:id/agent/review
 * Applies edits to the review summary and returns the new reviewHash.
 */
export const updateReviewEdits = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new appError("Unauthorized", 401);

    const result = await agentRunnerService.updateWorkflowReviewEdits(
      id,
      userId,
      req.body?.edits || [],
    );
    res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/applications/:id/agent/confirm
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
 * POST /api/applications/:id/agent/cancel
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
  updateReviewEdits,
  confirmReview,
  cancelApplication,
};
