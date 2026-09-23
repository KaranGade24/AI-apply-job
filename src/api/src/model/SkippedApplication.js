import mongoose from 'mongoose';

const skippedApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    jobTitle: { type: String, default: 'Untitled Position' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    sourceUrl: { type: String, required: true },
    applicationMethod: { type: String, default: 'unknown' },
    skipReason: {
      type: String,
      required: true,
      enum: [
        'SKILL_MISMATCH',
        'LOCATION_MISMATCH',
        'UNSUPPORTED_METHOD',
        'CONFIG_MISMATCH',
        'KEYWORD_MISMATCH',
        'EXPERIENCE_MISMATCH',
        'WORK_MODE_MISMATCH',
        'ALREADY_EXISTS',
        'OTHER'
      ],
      default: 'OTHER'
    },
    skipDetails: { type: String, default: '' },
    skippedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

skippedApplicationSchema.index({ userId: 1, sourceUrl: 1 }, { unique: true });
skippedApplicationSchema.index({ userId: 1, createdAt: -1 });

export const SkippedApplication =
  mongoose.models.SkippedApplication || mongoose.model('SkippedApplication', skippedApplicationSchema);
