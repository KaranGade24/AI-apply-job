import mongoose from 'mongoose';

const applicationEventSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
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
    },
    state: {
      type: String,
      required: true,
    },
    url: {
      type: String,
    },
    actionId: {
      type: String,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
    },
    screenshotReference: {
      type: String,
    },
    error: {
      type: String,
    },
  },
  { timestamps: true }
);

export const ApplicationEvent = mongoose.model('ApplicationEvent', applicationEventSchema);
export default ApplicationEvent;
