import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    aiSettings: {
      provider: { type: String, default: "googleGemini" },
      model: { type: String, default: "gemini-1.5-flash" },
      temperature: { type: Number, default: 0.1 },
      apiKey: { type: String, default: "" },
    },
    userSetting: {
      fullName: { type: String },
      email: { type: String },
      phone: { type: String },
      location: { type: String },
      portfolioUrl: { type: String },
      githubUrl: { type: String },
      linkedinUrl: { type: String },
      headline: { type: String },
    },
    jobSetting: {
      defaultSources: { type: [String], default: ["jobViaReferral", "naukri", "linkedin"] },
      keywords: { type: [String], default: [] },
      locations: { type: [String], default: [] },
      minExp: { type: Number, default: 0 },
      maxExp: { type: Number, default: 10 },
      workMode: {
        type: [String],
        default: ["remote", "hybrid", "workFromOffice"],
      },
      employmentType: { type: [String], default: ["fullTime"] },
      maxJobsToSearch: { type: Number, default: 20 },
      preferredApplicationMethods: {
        type: [String],
        default: ["email", "googleForm", "websiteForm", "phone", "unknown"],
      },
    },
    applicationSetting: {
      autoApplyEnabled: { type: Boolean, default: false },
      maxDailyApplications: { type: Number, default: 20 },
      notifyOnStatusChange: { type: Boolean, default: true },
      preferredEmail: { type: String },
    },
    resumeSetting: {
      defaultTemplate: { type: String, default: "ATS Modern" },
      targetPages: { type: Number, default: 1 },
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
  },
  {
    timestamps: true,
  },
);

export const Setting =
  mongoose.models.Setting || mongoose.model("Setting", settingSchema);
