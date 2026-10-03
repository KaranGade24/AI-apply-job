import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  personal: {
    fullName: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    address: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    headline: { type: String, default: '' },
    summary: { type: String, default: '' }
  },
  education: [{
    degree: { type: String, default: '' },
    institution: { type: String, default: '' },
    fieldOfStudy: { type: String, default: '' },
    graduationYear: { type: String, default: '' },
    gpa: { type: String, default: '' },
    description: { type: String, default: '' }
  }],
  experience: [{
    company: { type: String, default: '' },
    position: { type: String, default: '' },
    employmentType: { type: String, default: 'full-time' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    current: { type: Boolean, default: false },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    skills: [{ type: String }]
  }],
  skills: [{ type: String }],
  categorizedSkills: {
    languages: [{ type: String }],
    frameworks: [{ type: String }],
    databases: [{ type: String }],
    tools: [{ type: String }],
    cloud: [{ type: String }],
    other: [{ type: String }]
  },
  projects: [{
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    technologies: [{ type: String }],
    githubUrl: { type: String, default: '' },
    liveUrl: { type: String, default: '' },
    responsibilities: [{ type: String }],
    keyAchievements: [{ type: String }]
  }],
  certifications: [{ type: mongoose.Schema.Types.Mixed }],
  links: {
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    portfolio: { type: String, default: '' },
    other: [{ type: String }]
  },
  // Stored truthful answers to reusable application questions (Section 3, 12 & 29)
  applicationAnswers: {
    workAuthorization: { type: String, default: 'Yes, legally authorized to work' },
    requiresSponsorship: { type: Boolean, default: false },
    noticePeriod: { type: String, default: 'Immediate / 15 days' },
    expectedSalary: { type: String, default: 'Competitive / Open to discussion' },
    currentSalary: { type: String, default: '' },
    willingToRelocate: { type: String, default: 'Yes' },
    preferredWorkMode: { type: String, default: 'Hybrid / Remote' },
    yearsOfExperience: { type: String, default: '1-3 years' },
    professionalSummary: { type: String, default: '' },
    customAnswers: [{
      questionKey: { type: String, required: true },
      questionText: { type: String, default: '' },
      answerText: { type: String, default: '' },
      category: { type: String, default: 'general' },
      updatedAt: { type: Date, default: Date.now }
    }]
  },
  preferences: {
    targetTitles: [{ type: String }],
    targetLocations: [{ type: String }],
    excludedCompanies: [{ type: String }],
    minSalary: { type: Number, default: 0 }
  }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

export const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);
