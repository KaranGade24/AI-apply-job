import mongoose from 'mongoose';

const applicationQuestionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    questionKey: {
      type: String,
      required: true,
      index: true,
    },
    questionText: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'general',
      index: true,
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      enum: ['profile', 'resume', 'approvedBefore', 'llm', 'human'],
      default: 'human',
    },
    confidence: {
      type: Number,
      default: 1,
    },
    userConfirmed: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index per user and questionKey
applicationQuestionSchema.index({ userId: 1, questionKey: 1 }, { unique: true });

export const ApplicationQuestion =
  mongoose.models.ApplicationQuestion || mongoose.model('ApplicationQuestion', applicationQuestionSchema);
export default ApplicationQuestion;
