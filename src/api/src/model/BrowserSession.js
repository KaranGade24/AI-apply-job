import mongoose from 'mongoose';

const browserSessionSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    browserSessionId: {
      type: String,
      required: true,
      unique: true,
    },
    currentUrl: {
      type: String,
    },
    storageState: {
      type: mongoose.Schema.Types.Mixed,
    },
    activeTabs: [
      {
        tabId: String,
        url: String,
        title: String,
        role: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const BrowserSession = mongoose.model('BrowserSession', browserSessionSchema);
export default BrowserSession;
