import mongoose from "mongoose";
import { FAILURE_TYPES } from "../constant/application.constant.js";

const applicationAttemptSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    strategy: {
      type: String,
      default: "generic",
    },
    actionsExecuted: {
      type: Number,
      default: 0,
    },
    recoveryAttempts: {
      type: Number,
      default: 0,
    },
    outcome: {
      type: String,
      enum: ["in_progress", "completed", "requires_human", "failed", "loop_detected"],
      default: "in_progress",
    },
    errorClassification: {
      type: String,
      enum: [...Object.values(FAILURE_TYPES), null],
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    fingerprintHistory: [
      {
        fingerprint: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

applicationAttemptSchema.index({ applicationId: 1, attemptNumber: 1 });

export const ApplicationAttempt =
  mongoose.models.ApplicationAttempt ||
  mongoose.model("ApplicationAttempt", applicationAttemptSchema);
export default ApplicationAttempt;
