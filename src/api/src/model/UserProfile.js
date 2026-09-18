import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  personal: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  education: [{ type: mongoose.Schema.Types.Mixed }],
  experience: [{ type: mongoose.Schema.Types.Mixed }],
  skills: [{ type: String }],
  projects: [{ type: mongoose.Schema.Types.Mixed }],
  certifications: [{ type: mongoose.Schema.Types.Mixed }],
  links: {
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    portfolio: { type: String, default: '' }
  }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

export const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);
