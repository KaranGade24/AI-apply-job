import mongoose from "mongoose";
import { VERIFICATION_LEVELS } from "../constant/application.constant.js";

const applicationEventSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    state: {
      type: String,
      default: "INIT",
    },
    url: {
      type: String,
      default: "",
    },
    actionId: {
      type: String,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    verificationLevel: {
      type: String,
      enum: [...Object.values(VERIFICATION_LEVELS), null],
      default: null,
    },
    screenshotReference: {
      type: String,
      default: null,
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

applicationEventSchema.index({ applicationId: 1, timestamp: -1 });

export const ApplicationEvent =
  mongoose.models.ApplicationEvent ||
  mongoose.model("ApplicationEvent", applicationEventSchema);
export default ApplicationEvent;
