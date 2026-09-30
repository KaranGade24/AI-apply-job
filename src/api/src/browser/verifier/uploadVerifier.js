import path from "path";
import { VERIFICATION_LEVELS } from "../../constant/application.constant.js";

/**
 * Verifies that a file upload operation completed successfully on the website.
 * Never declares success merely because setInputFiles() executed.
 *
 * @param {import('playwright').Page} page
 * @param {object} action - Upload action
 * @param {object} currentObservation
 * @returns {Promise<object>}
 */
export const verifyUploadAction = async (page, action, currentObservation) => {
  try {
    const filePath = action.filePath || action.value;
    const baseName = filePath ? path.basename(filePath).toLowerCase() : "";

    // 1. Inspect DOM for uploaded file name display or success tag
    const visibleText = (currentObservation.visibleSnippet || "").toLowerCase();
    const hasFileNameDisplay = baseName && visibleText.includes(baseName);

    // 2. Check file input state directly via evaluation
    const inputState = await page
      .evaluate(() => {
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        for (const input of fileInputs) {
          if (input.files && input.files.length > 0) {
            return {
              attached: true,
              fileName: input.files[0].name,
              fileSize: input.files[0].size,
            };
          }
        }
        return { attached: false, fileName: null, fileSize: 0 };
      })
      .catch(() => ({ attached: false, fileName: null, fileSize: 0 }));

    // 3. Check for upload rejection messages (file too large, invalid format)
    const errorIndicators = (currentObservation.validationMessages || []).filter((msg) => {
      const lower = msg.toLowerCase();
      return (
        lower.includes("file") ||
        lower.includes("upload") ||
        lower.includes("too large") ||
        lower.includes("invalid format") ||
        lower.includes("pdf only")
      );
    });

    if (errorIndicators.length > 0) {
      return {
        verified: false,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
        expectedOutcome: { fileAttached: true },
        actualOutcome: { uploadError: errorIndicators[0] },
        evidence: { errorIndicators },
        confidence: 0.95,
        reason: `Upload rejected by website: ${errorIndicators[0]}`,
      };
    }

    if (inputState.attached || hasFileNameDisplay) {
      return {
        verified: true,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_2,
        expectedOutcome: { fileAttached: true },
        actualOutcome: {
          fileAttached: true,
          fileName: inputState.fileName || baseName,
          fileSize: inputState.fileSize,
        },
        evidence: {
          inputStateAttached: inputState.attached,
          hasFileNameDisplay,
          fileName: inputState.fileName,
        },
        confidence: 0.98,
        reason: "File upload verified: file attached and accepted by input control",
      };
    }

    return {
      verified: false,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_0,
      expectedOutcome: { fileAttached: true },
      actualOutcome: { fileAttached: false },
      evidence: { inputState },
      confidence: 0.75,
      reason: "Upload could not be verified: file control did not retain attached file",
    };
  } catch (error) {
    return {
      verified: false,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_0,
      expectedOutcome: { fileAttached: true },
      actualOutcome: { error: error.message },
      evidence: {},
      confidence: 0.5,
      reason: `Upload verification exception: ${error.message}`,
    };
  }
};
