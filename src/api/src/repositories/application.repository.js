import { JobApplication } from "../model/JobApplication.js";
import { Job, MatchStatus } from "../model/Job.js";
import { APPLICATION_STATUS, APPLICATION_METHOD } from "../constant/application.constant.js";
import { logError } from "../utils/logger.js";

/**
 * Helper to normalize raw application method strings to valid APPLICATION_METHOD enum values
 * @param {string} rawMethod
 * @returns {string} Valid APPLICATION_METHOD enum string
 */
export const normalizeApplicationMethod = (rawMethod = "") => {
  if (!rawMethod) return APPLICATION_METHOD.UNKNOWN;

  const val = String(rawMethod).trim();
  const lower = val.toLowerCase();

  // Direct match
  const validValues = Object.values(APPLICATION_METHOD);
  if (validValues.includes(val)) return val;
  if (validValues.includes(lower)) return lower;

  // Phone method
  if (lower.includes("phone") || lower.includes("whatsapp") || lower.includes("call")) {
    return APPLICATION_METHOD.PHONE;
  }
  // Google Form
  if (
    lower.includes("google") && lower.includes("form") ||
    lower.includes("forms.gle") ||
    lower.includes("googleform")
  ) {
    return APPLICATION_METHOD.GOOGLE_FORM;
  }
  // Email method
  if (lower.includes("email") || lower.includes("mailto")) {
    return APPLICATION_METHOD.EMAIL;
  }
  // Career site / portal / direct / naukri → UNKNOWN (AI will analyze)
  if (
    lower.includes("direct") ||
    lower.includes("link") ||
    lower.includes("website") ||
    lower.includes("portal") ||
    lower.includes("naukri") ||
    lower.includes("company_site") ||
    lower.includes("website_form") ||
    lower.includes("websiteform")
  ) {
    return APPLICATION_METHOD.UNKNOWN;
  }

  // Default: UNKNOWN — AI will analyze the page
  return APPLICATION_METHOD.UNKNOWN;
};

/**
 * Helper to normalize raw status string
 * @param {string} rawStatus
 * @returns {string} Normalized status
 */
export const normalizeApplicationStatus = (rawStatus = '') => {
  if (!rawStatus) return APPLICATION_STATUS.PENDING;
  const val = String(rawStatus).trim();
  const lower = val.toLowerCase();

  if (lower === 'applied') return 'Applied';
  if (lower === 'interview') return 'Interview';
  if (lower === 'offer') return 'Offer';
  if (lower === 'rejected') return 'Rejected';
  if (lower === 'sent') return 'sent';
  if (lower === 'pending') return 'pending';
  if (lower === 'waiting_for_review') return 'waiting_for_review';
  if (lower === 'approved') return 'approved';
  if (lower === 'failed') return 'failed';

  return val;
};

/**
 * Creates or upserts a job application record
 * @param {object} applicationData
 * @returns {Promise<object>} Created application document
 */
export const createApplication = async (applicationData) => {
  try {
    const { userId, jobId, applicationMethod, status } = applicationData;
    const existing = await JobApplication.findOne({ userId, jobId });
    if (existing) {
      if (status) {
        existing.status = normalizeApplicationStatus(status);
        await existing.save();
      }
      return existing;
    }
    const application = new JobApplication({
      ...applicationData,
      status: normalizeApplicationStatus(status),
      applicationMethod: normalizeApplicationMethod(applicationMethod),
    });
    return await application.save();
  } catch (error) {
    await logError("application.repository.createApplication", error.message);
    throw error;
  }
};

/**
 * Finds a job application by ID
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export const findApplicationById = async (id) => {
  try {
    return await JobApplication.findById(id).populate("jobId").populate("userId", "name email");
  } catch (error) {
    await logError("application.repository.findApplicationById", error.message);
    throw error;
  }
};

/**
 * Finds a job application by user and job IDs
 * @param {string} userId
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export const findApplicationByJobAndUser = async (userId, jobId) => {
  try {
    return await JobApplication.findOne({ userId, jobId }).populate("jobId");
  } catch (error) {
    await logError("application.repository.findApplicationByJobAndUser", error.message);
    throw error;
  }
};

/**
 * Finds the next pending application for a user
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export const findNextPendingApplication = async (userId) => {
  try {
    // 1. Check for existing pending application for this user
    const pendingApp = await JobApplication.findOne({
      userId,
      status: APPLICATION_STATUS.PENDING,
    })
      .sort({ createdAt: 1 })
      .populate("jobId");

    if (pendingApp) {
      return pendingApp;
    }

    // 2. Get list of jobIds for which an application already exists for this user
    const existingJobIds = await JobApplication.find({ userId }).distinct("jobId");

    // 3. Find next available job from Job model that does not have an application yet
    let candidateJob = await Job.findOne({
      _id: { $nin: existingJobIds },
      matchStatus: { $ne: MatchStatus.DISCARDED },
    }).sort({ createdAt: -1 });

    if (!candidateJob) {
      // Fallback: search any job not applied to yet
      candidateJob = await Job.findOne({
        _id: { $nin: existingJobIds },
      }).sort({ createdAt: -1 });
    }

    if (!candidateJob) {
      return null;
    }

    // 4. Create new pending application record for this candidate job
    const method = normalizeApplicationMethod(candidateJob.applicationMethod);

    const newApp = new JobApplication({
      userId,
      jobId: candidateJob._id,
      status: APPLICATION_STATUS.PENDING,
      applicationMethod: method,
    });

    await newApp.save();
    return await JobApplication.findById(newApp._id).populate("jobId");
  } catch (error) {
    await logError("application.repository.findNextPendingApplication", error.message);
    throw error;
  }
};

/**
 * Updates application status and appends a log event
 * @param {string} id
 * @param {string} status
 * @param {object} extraData
 * @returns {Promise<object|null>}
 */
export const updateApplicationStatus = async (id, status, extraData = {}) => {
  try {
    const normalizedStatus = normalizeApplicationStatus(status);
    const updateDoc = {
      status: normalizedStatus,
      ...extraData,
    };

    const logEntry = {
      timestamp: new Date(),
      event: `STATUS_CHANGED_${String(normalizedStatus).toUpperCase()}`,
      message: extraData.logMessage || `Application status set to ${normalizedStatus}`,
    };

    return await JobApplication.findByIdAndUpdate(
      id,
      {
        $set: updateDoc,
        $push: { "workflow.logs": logEntry },
      },
      { returnDocument: "after", runValidators: true }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationStatus", error.message);
    throw error;
  }
};

/**
 * Updates email details for a job application
 * @param {string} id
 * @param {object} emailData
 * @returns {Promise<object|null>}
 */
export const updateApplicationEmail = async (id, emailData) => {
  try {
    return await JobApplication.findByIdAndUpdate(
      id,
      {
        $set: {
          "email.recipient": emailData.recipient,
          "email.subject": emailData.subject,
          "email.body": emailData.body,
          ...(emailData.approved !== undefined && { "email.approved": emailData.approved }),
          ...(emailData.approvedAt !== undefined && { "email.approvedAt": emailData.approvedAt }),
          ...(emailData.sentAt !== undefined && { "email.sentAt": emailData.sentAt }),
          ...(emailData.error !== undefined && { "email.error": emailData.error }),
        },
      },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationEmail", error.message);
    throw error;
  }
};

/**
 * Updates tailored resume details for a job application
 * @param {string} id
 * @param {object} resumeData
 * @returns {Promise<object|null>}
 */
export const updateApplicationResume = async (id, resumeData) => {
  try {
    const setObj = {};
    if (resumeData.sourceResumeId !== undefined) {
      setObj["resume.sourceResumeId"] = resumeData.sourceResumeId;
    }
    if (resumeData.tailoredResumeData !== undefined) {
      setObj["resume.tailoredResumeData"] = resumeData.tailoredResumeData;
    }
    if (resumeData.pdfPath !== undefined) {
      setObj["resume.pdfPath"] = resumeData.pdfPath;
    }

    return await JobApplication.findByIdAndUpdate(
      id,
      { $set: setObj },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationResume", error.message);
    throw error;
  }
};

/**
 * Updates phone application details (call script, talking points, etc.)
 * @param {string} id
 * @param {object} phoneData
 * @returns {Promise<object|null>}
 */
export const updateApplicationPhone = async (id, phoneData = {}) => {
  try {
    return await JobApplication.findByIdAndUpdate(
      id,
      {
        $set: {
          "phoneApplication.phoneNumber": phoneData.phoneNumber || "",
          "phoneApplication.callScript": phoneData.callScript || "",
          "phoneApplication.talkingPoints": phoneData.talkingPoints || [],
          "phoneApplication.bestTimeToCall": phoneData.bestTimeToCall || "",
          "phoneApplication.followUpAction": phoneData.followUpAction || "",
          "phoneApplication.generatedAt": phoneData.generatedAt || new Date(),
        },
      },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationPhone", error.message);
    throw error;
  }
};

/**
 * Updates Google Form application results
 * @param {string} id
 * @param {object} googleFormData
 * @returns {Promise<object|null>}
 */
export const updateApplicationGoogleForm = async (id, googleFormData = {}) => {
  try {
    const updateSet = {
      "googleFormResult.googleFormUrl": googleFormData.googleFormUrl || "",
      "googleFormResult.fieldsDetected": googleFormData.fieldsDetected ?? 0,
      "googleFormResult.filledCount": googleFormData.filledCount ?? 0,
      "googleFormResult.skippedCount": googleFormData.skippedCount ?? 0,
      "googleFormResult.hasResumeField": googleFormData.hasResumeField ?? false,
      "googleFormResult.submitted": googleFormData.submitted ?? false,
      "googleFormResult.formClosed": googleFormData.formClosed ?? false,
      "googleFormResult.loginRequired": googleFormData.loginRequired ?? false,
      "googleFormResult.loginUrl": googleFormData.loginUrl || "",
      "googleFormResult.errors": googleFormData.errors || [],
      "googleFormResult.submittedAt": googleFormData.submittedAt || (googleFormData.submitted ? new Date() : null),
    };

    if (Array.isArray(googleFormData.extractedFields)) {
      updateSet["googleFormResult.extractedFields"] = googleFormData.extractedFields;
    }
    if (Array.isArray(googleFormData.validationErrors)) {
      updateSet["googleFormResult.validationErrors"] = googleFormData.validationErrors;
    }

    return await JobApplication.findByIdAndUpdate(
      id,
      { $set: updateSet },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationGoogleForm", error.message);
    throw error;
  }
};

/**
 * Updates unknown page analysis & execution results
 * @param {string} id
 * @param {object} unknownData
 * @returns {Promise<object|null>}
 */
export const updateApplicationUnknownResult = async (id, unknownData = {}) => {
  try {
    return await JobApplication.findByIdAndUpdate(
      id,
      {
        $set: {
          "unknownPageResult.pageUrl": unknownData.pageUrl || "",
          "unknownPageResult.detectedMethod": unknownData.detectedMethod || "",
          "unknownPageResult.actionTaken": unknownData.actionTaken || "",
          "unknownPageResult.message": unknownData.message || "",
          "unknownPageResult.analyzedAt": unknownData.analyzedAt || new Date(),
        },
      },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationUnknownResult", error.message);
    throw error;
  }
};

/**
 * Retrieves applications list for a user with pagination & filter
 * @param {string} userId
 * @param {object} filter
 * @returns {Promise<object>}
 */
export const getUserApplications = async (userId, { status, page = 1, limit = 100 } = {}) => {
  try {
    const query = { userId };
    if (status && status !== 'All') {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.max(1, parseInt(limit || '100', 10));
    const skip = (pageNum - 1) * limitNum;

    const [applications, total] = await Promise.all([
      JobApplication.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("jobId"),
      JobApplication.countDocuments(query),
    ]);

    return {
      applications,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    await logError("application.repository.getUserApplications", error.message);
    throw error;
  }
};

/**
 * Deletes a job application by ID
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export const deleteApplication = async (id) => {
  try {
    return await JobApplication.findByIdAndDelete(id);
  } catch (error) {
    await logError("application.repository.deleteApplication", error.message);
    throw error;
  }
};
