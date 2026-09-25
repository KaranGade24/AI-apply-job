import fs from "fs/promises";
import pdf from "pdf-parse";

/**
 * Validates the page count of a generated PDF
 * @param {string} pdfPath - Absolute path to the PDF file
 * @param {number} targetPages - Expected number of pages
 * @returns {Promise<{ isValid: boolean, actualPages: number }>}
 */
export const validatePdfPageCount = async (pdfPath, targetPages) => {
  try {
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdf(dataBuffer);

    const actualPages = data.numpages;
    return {
      isValid: actualPages === targetPages,
      actualPages,
    };
  } catch (error) {
    console.error("Error validating PDF page count:", error);
    // If validation fails, we assume it's invalid to be safe
    return { isValid: false, actualPages: -1 };
  }
};
