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
    form: {
      currentStep: { type: Number, default: 1 },
      totalSteps: { type: Number, default: 1 },
      isAccountCreation: { type: Boolean, default: false },
      isFinalStep: { type: Boolean, default: false },
      hasStepper: { type: Boolean, default: false },
      portalUrl: { type: String, default: "" },
      fields: [{ type: mongoose.Schema.Types.Mixed }],
      missingQuestions: [
        {
          questionId: { type: String, required: true },
          fieldId: { type: String, default: "" },
          question: { type: String, required: true },
          type: { type: String, default: "text" },
          required: { type: Boolean, default: false },
          options: [{ type: String }],
          placeholder: { type: String, default: "" },
        },
      ],
      answers: [
        {
          questionId: { type: String, required: true },
          fieldId: { type: String, default: "" },
          question: { type: String, default: "" },
          answer: { type: mongoose.Schema.Types.Mixed },
          source: { type: String, default: "user" }, // 'profile' | 'resume' | 'user' | 'ai' | 'setting'
          confidence: { type: Number, default: 1 },
          userConfirmed: { type: Boolean, default: false },
        },
      ],
      reviewFields: [
        {
          questionId: { type: String, required: true },
          fieldId: { type: String, default: "" },
          question: { type: String, required: true },
          type: { type: String, default: "text" },
          answer: { type: mongoose.Schema.Types.Mixed },
          source: { type: String, default: "profile" },
          options: [{ type: String }],
          required: { type: Boolean, default: false },
          isTermsAgreement: { type: Boolean, default: false },
        },
      ],
      requiresHuman: { type: Boolean, default: false },
      humanReason: { type: String, default: null }, // 'missingInformation' | 'captcha' | 'otp' | '2fa' | 'sessionExpired'
      submittedAt: { type: Date, default: null },
    },
    pageAnalysis: {
      pageType: { type: String, default: null },
      pageTitle: { type: String, default: "" },
      currentUrl: { type: String, default: "" },
      summary: { type: String, default: "" },
      isFormClosed: { type: Boolean, default: false },
      closedFormTitle: { type: String, default: "" },
      closedFormMessage: { type: String, default: "" },
      matchedRole: {
        title: { type: String, default: "" },
        referenceId: { type: String, default: "" },
        experience: { type: String, default: "" },
        location: { type: String, default: "" },
        actionSelector: { type: String, default: "" },
        targetButtonText: { type: String, default: "Apply Now" },
        isAccordion: { type: Boolean, default: false },
      },
      detectedOpenings: [{ type: String }],
      openingsList: [
        {
          id: { type: String, default: "" },
          title: { type: String, default: "" },
          referenceId: { type: String, default: "" },
          experience: { type: String, default: "" },
          location: { type: String, default: "" },
          descriptionSnippet: { type: String, default: "" },
          email: { type: String, default: "" },
          hasApplyBtn: { type: Boolean, default: false },
          buttonText: { type: String, default: "Apply Now" },
        },
      ],
      instructions: { type: String, default: "" },
      emailContact: {
        email: { type: String, default: "" },
        subject: { type: String, default: "" },
        referenceId: { type: String, default: "" },
      },
      roleOutreaches: [
        {
          roleTitle: { type: String, default: "" },
          referenceId: { type: String, default: "" },
          email: { type: String, default: "" },
          subject: { type: String, default: "" },
          body: { type: String, default: "" },
          pdfPath: { type: String, default: "" },
          tailoredResumeData: { type: mongoose.Schema.Types.Mixed, default: null },
          status: { type: String, default: "draft" },
          sentAt: { type: Date, default: null },
        },
      ],
      nextRecommendedAction: { type: String, default: "" },
      actionReason: { type: String, default: "" },
      analyzedAt: { type: Date, default: null },
    },
    /**
     * Phone Application Method — stores call script and talking points for human action
     */
    phoneApplication: {
      phoneNumber: { type: String, default: "" },
      callScript: { type: String, default: "" },
      talkingPoints: [{ type: String }],
      bestTimeToCall: { type: String, default: "" },
      followUpAction: { type: String, default: "" },
      generatedAt: { type: Date, default: null },
    },
    /**
     * Google Form Application Method — stores result of automated form submission
     */
    googleFormResult: {
      googleFormUrl: { type: String, default: "" },
      fieldsDetected: { type: Number, default: 0 },
      filledCount: { type: Number, default: 0 },
      skippedCount: { type: Number, default: 0 },
      hasResumeField: { type: Boolean, default: false },
      submitted: { type: Boolean, default: false },
      formClosed: { type: Boolean, default: false },
      loginRequired: { type: Boolean, default: false },
      loginUrl: { type: String, default: "" },
      errors: [{ type: String }],
      validationErrors: [{ type: String }],
      extractedFields: [
        {
          fieldIndex: { type: Number },
          questionText: { type: String, default: "" },
          fieldType: { type: String, default: "text" },
          isRequired: { type: Boolean, default: false },
          options: [{ type: String }],
          resolvedAnswer: { type: mongoose.Schema.Types.Mixed, default: "" },
          isFilled: { type: Boolean, default: false },
          isMissing: { type: Boolean, default: false },
          error: { type: String, default: null },
        },
      ],
      submittedAt: { type: Date, default: null },
    },
    /**
     * Unknown Page Result — stores AI analysis result when method was initially unknown
     */
    unknownPageResult: {
      pageUrl: { type: String, default: "" },
      detectedMethod: { type: String, default: "" },
      actionTaken: { type: String, default: "" },
      message: { type: String, default: "" },
      analyzedAt: { type: Date, default: null },
    },
    currentState: {
      type: String,
      default: "INIT",
      index: true,
    },
    browserSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrowserSession",
      default: null,
    },
    submissionVerification: {
      verified: { type: Boolean, default: false },
      verificationLevel: { type: String, default: null },
      confirmationId: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      evidence: [{ type: String }],
      screenshotUrl: { type: String, default: null },
    },
    preSubmissionReview: {
      readyForReview: { type: Boolean, default: false },
      userConfirmed: { type: Boolean, default: false },
      confirmedAt: { type: Date, default: null },
      summary: { type: mongoose.Schema.Types.Mixed, default: null },
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
      currentStage: {
        type: String,
        enum: ["initialized", "analyzing", "navigating", "formMode", "paused", "completed"],
        default: "initialized",
      },
      rejectionReason: {
        type: String,
        default: null,
      },
      agentState: {
        visitedPages: [
          {
            url: { type: String },
            title: { type: String, default: "" },
            pageType: { type: String, default: "unknown" },
            fingerprint: { type: String, default: "" },
            visitedAt: { type: Date, default: Date.now },
          },
        ],
        actions: [
          {
            type: { type: String },
            target: { type: mongoose.Schema.Types.Mixed },
            value: { type: String, default: null },
            success: { type: Boolean, default: false },
            pageChanged: { type: Boolean, default: false },
            timestamp: { type: Date, default: Date.now },
          },
        ],
        currentPage: {
          url: { type: String, default: "" },
          pageType: { type: String, default: "unknown" },
          fingerprint: { type: String, default: "" },
        },
        discoveredMethod: { type: String, default: null },
        counters: {
          totalActions: { type: Number, default: 0 },
          totalDecisions: { type: Number, default: 0 },
          retriesForCurrentAction: { type: Number, default: 0 },
          samePageVisits: { type: Number, default: 0 },
        },
        pendingHumanAction: {
          reason: { type: String, default: null },
          savedUrl: { type: String, default: null },
          savedStorageState: { type: mongoose.Schema.Types.Mixed, default: null },
        },
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
