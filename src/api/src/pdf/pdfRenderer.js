import path from "path";
import fs from "fs/promises";
import { createBrowser } from "../browser/browserConfig.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Renders HTML string to PDF using Playwright Chromium and saves to output path
 * @param {string} htmlContent - Full HTML document string
 * @param {string} outputPath - Relative or absolute destination path for PDF
 * @returns {Promise<string>} Resolved output path
 */
export const renderHtmlToPdf = async (htmlContent, outputPath) => {
  let browser = null;
  let page = null;
  try {
    const resolvedPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);

    // Ensure target directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    browser = await createBrowser();
    page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: "domcontentloaded",
    });

    await page.pdf({
      path: resolvedPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "6mm",
        right: "8mm",
        bottom: "6mm",
        left: "8mm",
      },
    });

    return resolvedPath;
  } catch (error) {
    await logError("pdfRenderer.renderHtmlToPdf", error.message);
    throw new appError(`PDF rendering failed: ${error.message}`, 500);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};
