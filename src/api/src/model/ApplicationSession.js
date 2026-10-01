import mongoose from "mongoose";
import { MAX_AGENT_STEPS } from "../constant/agent.constant.js";

const applicationSessionSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    threadId: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      default: "processing",
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
    currentUrl: {
      type: String,
      default: "",
    },
    pageType: {
      type: String,
      default: "unknown",
    },
    stepCount: {
      type: Number,
      default: 0,
    },
    pendingQuestions: [
      {
        questionId: { type: String, required: true },
        questionText: { type: String, default: "" },
        type: { type: String, default: "text" },
        required: { type: Boolean, default: false },
        options: [{ type: String }],
        placeholder: { type: String, default: "" },
      },
    ],
    answers: [
      {
        questionId: { type: String, required: true },
        question: { type: String, default: "" },
        answer: { type: mongoose.Schema.Types.Mixed },
        source: { type: String, default: "user" },
        confidence: { type: Number, default: 1 },
        userConfirmed: { type: Boolean, default: false },
      },
    ],
    finalReview: {
      readyForReview: { type: Boolean, default: false },
      userConfirmed: { type: Boolean, default: false },
      confirmedAt: { type: Date, default: null },
      fields: [{ type: mongoose.Schema.Types.Mixed }],
    },
    submission: {
      verified: { type: Boolean, default: false },
      status: { type: String, default: null },
      receiptId: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    errors: [
      {
        timestamp: { type: Date, default: Date.now },
        step: { type: String, default: "" },
        message: { type: String, required: true },
        stack: { type: String, default: "" },
      },
    ],
    history: {
      type: [
        {
          timestamp: { type: Date, default: Date.now },
          action: { type: String, required: true },
          pageUrl: { type: String, default: "" },
          pageType: { type: String, default: "" },
          details: { type: mongoose.Schema.Types.Mixed, default: null },
        },
      ],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  },
);

// Pre-save hook to cap history array to MAX_AGENT_STEPS (50 items max)
const MAX_HISTORY_CAP = MAX_AGENT_STEPS || 50;
applicationSessionSchema.pre("save", function () {
  if (this.history && this.history.length > MAX_HISTORY_CAP) {
    this.history = this.history.slice(-MAX_HISTORY_CAP);
  }
});

applicationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ApplicationSession = mongoose.model(
  "ApplicationSession",
  applicationSessionSchema,
);
export default ApplicationSession;
