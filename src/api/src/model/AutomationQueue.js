import mongoose from 'mongoose';

export const QUEUE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ANALYZING: 'ANALYZING',
  DEEP_DIVING: 'DEEP_DIVING',
  PREPARING: 'PREPARING',
  WAITING_FOR_USER: 'WAITING_FOR_USER',
  FILLING: 'FILLING',
  SUBMITTING: 'SUBMITTING',
  SUBMITTED: 'SUBMITTED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
});

const automationQueueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(QUEUE_STATUS),
      default: QUEUE_STATUS.PENDING,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 2,
    },
    currentStep: {
      type: String,
      default: 'Discovered',
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        step: { type: String, default: '' },
        message: { type: String, default: '' },
        status: { type: String, default: 'INFO' },
      },
    ],
    errorReason: {
      type: String,
      default: null,
    },
    missingInfoRequired: {
      questionId: { type: String, default: null },
      questionText: { type: String, default: null },
      category: { type: String, default: 'general' },
    },
    evidence: {
      screenshotUrl: { type: String, default: null },
      confirmationText: { type: String, default: null },
      submissionUrl: { type: String, default: null },
      submittedAt: { type: Date, default: null },
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to avoid adding the exact same job twice to an active queue
automationQueueSchema.index({ userId: 1, jobId: 1, status: 1 });

export const AutomationQueue =
  mongoose.models.AutomationQueue ||
  mongoose.model('AutomationQueue', automationQueueSchema);

export default AutomationQueue;
