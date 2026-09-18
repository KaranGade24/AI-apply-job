import mongoose from 'mongoose';

export const ResumeType = {
  ORIGINAL: 'ORIGINAL',
  TAILORED: 'TAILORED'
};

const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalFile: { type: String, default: null },
  parsedData: { type: mongoose.Schema.Types.Mixed, default: null },
  version: { type: Number, default: 1 },
  type: { type: String, enum: [ResumeType.ORIGINAL, ResumeType.TAILORED], default: ResumeType.ORIGINAL },
  jobId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Null for original resume
  // fileUrl: { type: String, default: '' }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

export const Resume = mongoose.models.Resume || mongoose.model('Resume', resumeSchema);
