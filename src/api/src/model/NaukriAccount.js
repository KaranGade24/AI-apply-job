import mongoose from 'mongoose';
import { NAUKRI_AUTH_STATUS } from '../constant/naukri.constant.js';

const naukriAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    source: {
      type: String,
      default: 'naukri'
    },
    // Encrypted browser context storageState (cookies, origins, localStorage)
    // Absolute zero storage of user email, naukri password, or Google password
    encryptedStorageState: {
      algorithm: {
        type: String,
        default: 'aes-256-gcm'
      },
      iv: {
        type: String,
        default: ''
      },
      authTag: {
        type: String,
        default: ''
      },
      cipherText: {
        type: String,
        default: ''
      }
    },
    status: {
      type: String,
      enum: Object.values(NAUKRI_AUTH_STATUS),
      default: NAUKRI_AUTH_STATUS.DISCONNECTED,
      index: true
    },
    userName: {
      type: String,
      default: '',
      trim: true
    },
    userEmail: {
      type: String,
      default: '',
      trim: true
    },
    lastValidatedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const NaukriAccount =
  mongoose.models.NaukriAccount || mongoose.model('NaukriAccount', naukriAccountSchema);

export default NaukriAccount;
