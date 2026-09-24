import mongoose from "mongoose";
import { APPLICATION_STATUS, APPLICATION_METHOD } from "../constant/application.constant.js";

const jobApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        ...Object.values(APPLICATION_STATUS),
        "applied",
        "Applied",
        "interview",
        "Interview",
        "offer",
        "Offer",
        "rejected",
        "Rejected",
        "pending",
        "Pending",
        "sent",
        "Sent",
        "waiting_for_review",
        "processing",
        "Processing",
        "approved",
        "Approved",
        "failed",
        "Failed",
      ],
      default: APPLICATION_STATUS.PENDING,
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    applicationMethod: {
      type: String,
      enum: Object.values(APPLICATION_METHOD),
      default: APPLICATION_METHOD.EMAIL,
    },
    email: {
      recipient: {
        type: String,
        trim: true,
        default: "",
      },
      subject: {
        type: String,
        trim: true,
        default: "",
      },
      body: {
        type: String,
        default: "",
      },
      approved: {
        type: Boolean,
        default: false,
      },
      approvedAt: {
        type: Date,
        default: null,
      },
      sentAt: {
        type: Date,
        default: null,
      },
      error: {
        type: String,
        default: null,
      },
    },
    resume: {
      sourceResumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resume",
        default: null,
      },
      tailoredResumeData: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      pdfPath: {
        type: String,
        default: null,
      },
    },
    workflow: {
      threadId: {
        type: String,
        default: "",
      },
      currentStep: {
        type: String,
        default: "initialized",
      },
      rejectionReason: {
        type: String,
        default: null,
      },
      logs: [
        {
          timestamp: { type: Date, default: Date.now },
          event: String,
          message: String,
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent creating duplicate applications for the same user and job
jobApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const JobApplication = mongoose.model("JobApplication", jobApplicationSchema);
