import { JobApplication } from "../model/JobApplication.js";
import { APPLICATION_STATUS } from "../constant/application.constant.js";
import { logError } from "../utils/logger.js";

/**
 * Creates or upserts a job application record
 * @param {object} applicationData
 * @returns {Promise<object>} Created application document
 */
export const createApplication = async (applicationData) => {
  try {
    const { userId, jobId } = applicationData;
    const existing = await JobApplication.findOne({ userId, jobId });
    if (existing) {
      return existing;
    }
    const application = new JobApplication(applicationData);
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
    return await JobApplication.findOne({
      userId,
      status: APPLICATION_STATUS.PENDING,
    })
      .sort({ createdAt: 1 })
      .populate("jobId");
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
    const updateDoc = {
      status,
      ...extraData,
    };

    const logEntry = {
      timestamp: new Date(),
      event: `STATUS_CHANGED_${status.toUpperCase()}`,
      message: extraData.logMessage || `Application status set to ${status}`,
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
    return await JobApplication.findByIdAndUpdate(
      id,
      {
        $set: {
          "resume.sourceResumeId": resumeData.sourceResumeId,
          "resume.tailoredResumeData": resumeData.tailoredResumeData,
          "resume.pdfPath": resumeData.pdfPath,
        },
      },
      { returnDocument: "after" }
    );
  } catch (error) {
    await logError("application.repository.updateApplicationResume", error.message);
    throw error;
  }
};

/**
 * Retrieves applications list for a user with pagination & filter
 * @param {string} userId
 * @param {object} filter
 * @returns {Promise<object>}
 */
export const getUserApplications = async (userId, { status, page = 1, limit = 10 } = {}) => {
  try {
    const query = { userId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const [applications, total] = await Promise.all([
      JobApplication.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("jobId", "title companyName location workMode applicationMethod sourceUrl"),
      JobApplication.countDocuments(query),
    ]);

    return {
      applications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    await logError("application.repository.getUserApplications", error.message);
    throw error;
  }
};
