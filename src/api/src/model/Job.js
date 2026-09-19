import mongoose from 'mongoose';

export const MatchStatus = Object.freeze({
  MATCHED: 'MATCHED',
  NOT_MATCHED: 'NOT_MATCHED',
  PENDING_MATCH: 'PENDING_MATCH',
  DISCARDED: 'DISCARDED'
});

export const WorkMode = Object.freeze({
  REMOTE: 'remote',
  HYBRID: 'hybrid',
  OFFICE: 'office',
  WORK_FROM_OFFICE: 'workFromOffice',
  UNSPECIFIED: 'unspecified'
});

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  company: { type: String, default: 'Company Not Specified', trim: true },
  location: { type: String, default: 'Remote / Unspecified', trim: true },
  experienceRequired: { type: String, default: 'Not Specified', trim: true },
  description: { type: String, default: '' },
  requirements: [{ type: String }],
  responsibilities: [{ type: String }],
  skills: [{ type: String }],
  resumeTips: [{ type: String }],
  howToApply: { type: String, default: '' },
  applicationUrl: { type: String, default: '' },
  hrEmail: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  emailSubject: { type: String, default: '' },
  applicationMethod: { type: String, default: 'NOT_SPECIFIED' },
  sourceUrl: { type: String, required: true, unique: true, index: true },
  source: { type: String, default: '' },
  postedDate: { type: Date, default: Date.now },
  workMode: { type: String, enum: Object.values(WorkMode), default: WorkMode.UNSPECIFIED },
  employmentType: { type: String, default: 'fullTime' },

  // Candidate Resume Matching fields
  matchStatus: { type: String, enum: Object.values(MatchStatus), default: MatchStatus.PENDING_MATCH, index: true },
  matchScore: { type: Number, min: 0, max: 100, default: 0 },
  matchReason: { type: String, default: '' },
  matchedSkills: [{ type: String }],
  missingSkills: [{ type: String }],
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null }
}, {
  timestamps: true
});

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
export default Job;
