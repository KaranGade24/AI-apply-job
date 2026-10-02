import fs from 'fs';
import path from 'path';
import { generateResumePdf } from '../../pdf/resumePdfService.js';
import { JobApplication } from '../../model/JobApplication.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Shared wrapper for on-demand resume PDF generation.
 * Checks if a PDF already exists on disk for this application before triggering generation.
 *
 * @param {object} params
 * @param {string} [params.applicationId]
 * @param {string} params.userId
 * @param {object} params.tailoredResume - Tailored or base resume data
 * @param {string} [params.template] - PDF template name
 * @returns {Promise<{ pdfPath: string|null, alreadyGenerated: boolean }>}
 */
export const generateResumePdfOnDemand = async ({
  applicationId = null,
  userId,
  tailoredResume,
  template = null,
}) => {
  try {
    // 1. Check if application record already points to an existing PDF file
    if (applicationId) {
      const app = await JobApplication.findById(applicationId).select('resume.pdfPath').lean();
      const existingPath = app?.resume?.pdfPath;
      if (existingPath && fs.existsSync(existingPath)) {
        await logJobEvent(
          'resumePdfGenerator',
          'REUSE_EXISTING_PDF',
          `Reusing existing PDF for application ${applicationId}: ${existingPath}`
        );
        return {
          pdfPath: existingPath,
          alreadyGenerated: true,
        };
      }
    }

    // 2. Generate PDF
    await logJobEvent(
      'resumePdfGenerator',
      'GENERATING_PDF',
      `Generating on-demand resume PDF for user ${userId}`
    );

    const pdfPath = await generateResumePdf({
      resumeData: tailoredResume,
      template,
      userId,
    });

    // 3. Persist path to DB if applicationId provided
    if (applicationId && pdfPath) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        'resume.pdfPath': pdfPath,
      });
    }

    return {
      pdfPath,
      alreadyGenerated: false,
    };
  } catch (error) {
    await logError('resumePdfGenerator.generateResumePdfOnDemand', error.message);
    return {
      pdfPath: null,
      alreadyGenerated: false,
    };
  }
};

/**
 * Verifies that a candidate PDF path exists on disk, and if missing (or a Windows/external path),
 * dynamically generates a valid tailored/candidate PDF on disk in the Linux environment.
 *
 * @param {object} params
 * @param {string} [params.candidatePath]
 * @param {string} [params.userId]
 * @param {object} [params.resumeData]
 * @returns {Promise<string|null>} Guaranteed valid local file path or null
 */
export const ensureEffectiveResumePdfOnDisk = async ({
  candidatePath = null,
  userId = null,
  resumeData = null,
} = {}) => {
  try {
    // 1. If candidatePath already exists on disk, return it directly
    if (candidatePath && typeof candidatePath === 'string') {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }

      // Check if filename exists in /tmp or standard uploads directory
      const cleanName = path.basename(candidatePath.replace(/\\/g, '/'));
      const tmpPath = path.join('/tmp', cleanName);
      if (fs.existsSync(tmpPath)) {
        return tmpPath;
      }
    }

    // 2. If not found or path was non-existent/foreign, generate fresh PDF
    let effectiveData = resumeData;
    if (!effectiveData && userId) {
      const { findOriginalResumeByUserId } = await import('../../repositories/resume.repository.js');
      const dbResume = await findOriginalResumeByUserId(userId).catch(() => null);
      if (dbResume?.parsedData) {
        effectiveData = typeof dbResume.parsedData === 'string'
          ? JSON.parse(dbResume.parsedData)
          : dbResume.parsedData;
      }
    }

    if (!effectiveData) {
      let candidateName = 'Candidate Applicant';
      let candidateEmail = '';
      let candidatePhone = '';
      if (userId) {
        const { findUserProfileByUserId, findUserById } = await import('../../repositories/user.repository.js');
        const uProfile = await findUserProfileByUserId(userId).catch(() => null);
        const uRecord = await findUserById(userId).catch(() => null);
        
        // Priority: Profile names -> Default (never account username like test1)
        if (uProfile?.personal?.firstName || uProfile?.personal?.lastName) {
          candidateName = `${uProfile.personal.firstName || ''} ${uProfile.personal.lastName || ''}`.trim();
        } else if (uProfile?.fullName && uProfile.fullName !== 'Candidate') {
          candidateName = uProfile.fullName;
        }
        candidateEmail = uRecord?.email || uProfile?.email || '';
        candidatePhone = uProfile?.personal?.phone || '';
      }
      effectiveData = {
        personalInfo: { fullName: candidateName, email: candidateEmail, phone: candidatePhone },
        summary: 'Experienced professional with a strong track record of achievements.',
        skills: ['Professional Expertise'],
      };
    }


    const generatedPath = await generateResumePdf({
      resumeData: effectiveData,
      userId,
    });

    if (generatedPath && fs.existsSync(generatedPath)) {
      await logJobEvent(
        'resumePdfGenerator',
        'ENSURE_PDF_SUCCESS',
        `Successfully ensured valid PDF on disk: ${generatedPath}`
      );
      return generatedPath;
    }

    return null;
  } catch (err) {
    await logError('resumePdfGenerator.ensureEffectiveResumePdfOnDisk', err.message);
    return null;
  }
};
