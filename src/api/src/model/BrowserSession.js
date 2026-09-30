import mongoose from "mongoose";

const browserSessionSchema = new mongoose.Schema(
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
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "disconnected", "closed", "error"],
      default: "active",
      index: true,
    },
    currentUrl: {
      type: String,
      default: "",
    },
    pageTitle: {
      type: String,
      default: "",
    },
    currentTabId: {
      type: String,
      default: "tab_1",
    },
    tabs: [
      {
        tabId: { type: String, required: true },
        url: { type: String, default: "" },
        title: { type: String, default: "" },
        openedAt: { type: Date, default: Date.now },
        parentTabId: { type: String, default: null },
        role: {
          type: String,
          enum: [
            "JOB_PAGE",
            "APPLICATION_PAGE",
            "AUTH_PAGE",
            "UPLOAD_PAGE",
            "EXTERNAL_PAGE",
            "CONFIRMATION_PAGE",
            "UNKNOWN",
          ],
          default: "JOB_PAGE",
        },
      },
    ],
    storageState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastCheckpoint: {
      applicationState: { type: String, default: "INIT" },
      lastActionId: { type: String, default: null },
      lastVerifiedState: { type: String, default: null },
      timestamp: { type: Date, default: Date.now },
      metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    lastScreenshotPath: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const BrowserSession =
  mongoose.models.BrowserSession ||
  mongoose.model("BrowserSession", browserSessionSchema);
export default BrowserSession;
