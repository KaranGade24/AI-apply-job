import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  aiSettings: {
    provider: { type: String, default: 'googleGemini' },
    model: { type: String, default: 'gemini-2.0-flash' },
    temperature: { type: Number, default: 0.1 },
    apiKey: { type: String, default: '' },
  },
  userSetting: {
    fullName: { type: String, default: 'Karan Gade' },
    email: { type: String, default: 'karan@example.com' },
    phone: { type: String, default: '+91 8446726903' },
    location: { type: String, default: 'Pune, Maharashtra' },
    portfolioUrl: { type: String, default: 'https://portfolio-karan-gade.vercel.app' },
    githubUrl: { type: String, default: 'https://github.com/KaranGade24' },
    linkedinUrl: { type: String, default: 'https://linkedin.com/in/karan-gade' },
    headline: { type: String, default: 'Full Stack Web Developer (MERN) | AI-Integrated Web Applications' },
  },
  jobSetting: {
    defaultSources: { type: [String], default: ['jobViaReferral', 'naukri', 'linkedin'] },
    keywords: { type: [String], default: ['MERN Developer', 'Node.js Developer', 'Backend Developer'] },
    locations: { type: [String], default: ['Pune', 'Remote'] },
    minExp: { type: Number, default: 0 },
    maxExp: { type: Number, default: 2 },
    workMode: { type: [String], default: ['remote', 'hybrid', 'workFromOffice'] },
    employmentType: { type: [String], default: ['fullTime'] },
    preferredApplicationMethods: { type: [String], default: ['email', 'googleForm', 'phone', 'unknown'] },
  },
  applicationSetting: {
    autoApplyEnabled: { type: Boolean, default: false },
    maxDailyApplications: { type: Number, default: 20 },
    notifyOnStatusChange: { type: Boolean, default: true },
    preferredEmail: { type: String, default: 'gadekaran24@gmail.com' },
  },
  resumeSetting: {
    defaultTemplate: { type: String, default: 'ATS Modern' },
    targetPages: { type: Number, default: 2 },
    sections: {
      header: { type: Boolean, default: true },
      summary: { type: Boolean, default: true },
      skills: { type: Boolean, default: true },
      experience: { type: Boolean, default: true },
      education: { type: Boolean, default: true },
      projects: { type: Boolean, default: true },
      certifications: { type: Boolean, default: true },
    },
  },
}, {
  timestamps: true,
});

export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
