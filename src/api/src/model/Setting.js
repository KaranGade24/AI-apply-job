import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    aiSettings: {
      provider: { type: String },
      model: { type: String },
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
      defaultSources: { type: [String] },
      keywords: { type: [String] },
      locations: { type: [String] },
      minExp: { type: Number, default: 0 },
      maxExp: { type: Number, default: 2 },
      workMode: {
        type: [String],
        default: ["remote", "hybrid", "workFromOffice"],
      },
      employmentType: { type: [String], default: ["fullTime"] },
      preferredApplicationMethods: {
        type: [String],
        default: ["email", "googleForm", "phone", "unknown"],
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
  },
  {
    timestamps: true,
  },
);

export const Setting =
  mongoose.models.Setting || mongoose.model("Setting", settingSchema);
