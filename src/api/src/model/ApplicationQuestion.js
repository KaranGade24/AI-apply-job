import mongoose from "mongoose";
import { QUESTION_CLASSIFICATIONS } from "../constant/application.constant.js";

const applicationQuestionSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },
    questionId: {
      type: String,
      required: true,
    },
    fieldId: {
      type: String,
      default: "",
    },
    questionText: {
      type: String,
      required: true,
    },
    fieldType: {
      type: String,
      default: "text",
    },
    options: [
      {
        type: String,
      },
    ],
    required: {
      type: Boolean,
      default: false,
    },
    classification: {
      type: String,
      enum: [...Object.values(QUESTION_CLASSIFICATIONS), "UNKNOWN"],
      default: QUESTION_CLASSIFICATIONS.MISSING_INFORMATION,
    },
    source: {
      type: {
        type: String,
        default: "userProfile",
      },
      path: {
        type: String,
        default: "",
      },
    },
    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    currentAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    resolvedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["unresolved", "human_pending", "resolved", "skipped"],
      default: "unresolved",
    },
    userConfirmed: {
      type: Boolean,
      default: false,
    },
    screenshot: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

applicationQuestionSchema.index({ applicationId: 1, questionId: 1 }, { unique: true });

export const ApplicationQuestion =
  mongoose.models.ApplicationQuestion ||
  mongoose.model("ApplicationQuestion", applicationQuestionSchema);
export default ApplicationQuestion;
