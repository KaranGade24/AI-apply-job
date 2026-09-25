import mongoose from 'mongoose';

const browserSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: ['naukri'],
      required: true,
      default: 'naukri',
    },

    encryptedStorageState: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ['active', 'expired', 'invalid'],
      default: 'active',
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

browserSessionSchema.index({ userId: 1, source: 1 }, { unique: true });

export const BrowserSession =
  mongoose.models.BrowserSession || mongoose.model('BrowserSession', browserSessionSchema);
