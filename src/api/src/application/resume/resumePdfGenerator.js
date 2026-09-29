import fs from 'fs';
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
