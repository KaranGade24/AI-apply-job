import mongoose from 'mongoose';
import { GOOGLE_AUTH_STATUS } from '../constant/google.constant.js';

const googleAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Encrypted browser context storageState (cookies, origins, localStorage)
    // Absolute zero storage of user password; cookies encrypted with AES-256-GCM
    encryptedStorageState: {
      algorithm: {
        type: String,
        default: 'aes-256-gcm',
      },
      iv: {
        type: String,
        default: '',
      },
      authTag: {
        type: String,
        default: '',
      },
      cipherText: {
        type: String,
        default: '',
      },
    },
    status: {
      type: String,
      enum: Object.values(GOOGLE_AUTH_STATUS),
      default: GOOGLE_AUTH_STATUS.DISCONNECTED,
      index: true,
    },
    userName: {
      type: String,
      default: '',
      trim: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    lastValidatedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const GoogleAccount = mongoose.model('GoogleAccount', googleAccountSchema);
