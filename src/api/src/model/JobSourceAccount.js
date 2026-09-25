import mongoose from 'mongoose';

const jobSourceAccountSchema = new mongoose.Schema(
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

    loginMethod: {
      type: String,
      enum: ['credentials', 'google'],
      required: true,
      default: 'credentials',
    },

    accountIdentifier: {
      type: String,
      default: '',
    },

    credentials: {
      username: {
        type: String,
        default: null,
      },
      password: {
        type: String,
        default: null,
      },
    },

    status: {
      type: String,
      enum: [
        'disconnected',
        'connecting',
        'connected',
        'expired',
        'verificationRequired',
        'blocked',
        'error',
      ],
      default: 'disconnected',
    },

    lastValidatedAt: {
      type: Date,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

jobSourceAccountSchema.index({ userId: 1, source: 1 }, { unique: true });

export const JobSourceAccount =
  mongoose.models.JobSourceAccount || mongoose.model('JobSourceAccount', jobSourceAccountSchema);
