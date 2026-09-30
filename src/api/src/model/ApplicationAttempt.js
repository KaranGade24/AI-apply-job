import mongoose from 'mongoose';

const applicationAttemptSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      required: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      default: 1,
    },
    actionId: {
      type: String,
    },
    actionType: {
      type: String,
    },
    target: {
      type: mongoose.Schema.Types.Mixed,
    },
    executionResult: {
      type: mongoose.Schema.Types.Mixed,
    },
    verificationResult: {
      type: mongoose.Schema.Types.Mixed,
    },
    recoveryUsed: {
      type: String,
    },
    success: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const ApplicationAttempt = mongoose.model('ApplicationAttempt', applicationAttemptSchema);
export default ApplicationAttempt;
