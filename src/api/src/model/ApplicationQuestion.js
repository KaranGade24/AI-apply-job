import mongoose from 'mongoose';

const applicationQuestionSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      required: true,
      index: true,
    },
    questionId: {
      type: String,
      required: true,
    },
    questionText: {
      type: String,
      required: true,
    },
    fieldType: {
      type: String,
      default: 'text',
    },
    options: [String],
    currentValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    source: {
      type: String,
      default: 'website',
    },
    reason: {
      type: String,
    },
    required: {
      type: Boolean,
      default: true,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
    },
    confidence: {
      type: Number,
      default: 1.0,
    },
  },
  { timestamps: true }
);

export const ApplicationQuestion = mongoose.model('ApplicationQuestion', applicationQuestionSchema);
export default ApplicationQuestion;
