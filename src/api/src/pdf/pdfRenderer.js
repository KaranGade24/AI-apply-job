import path from "path";
import fs from "fs/promises";
import { createBrowser } from "../browser/browserConfig.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Renders an HTML document to an A4 PDF using Playwright Chromium with bidirectional dynamic page-fit scaling.
 *
 * @param {string} htmlContent - Complete HTML document
 * @param {string} outputPath - Relative or absolute PDF destination
 * @returns {Promise<string>} Resolved PDF path
 */
export const renderHtmlToPdf = async (htmlContent, outputPath) => {
  let browser = null;
  let page = null;

  try {
    if (!htmlContent || typeof htmlContent !== "string") {
      throw new Error("HTML content is required for PDF rendering");
    }

    if (!outputPath || typeof outputPath !== "string") {
      throw new Error("Output path is required for PDF rendering");
    }

    const resolvedPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);

    await fs.mkdir(path.dirname(resolvedPath), {
      recursive: true,
    });

    browser = await createBrowser();
    page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: "networkidle",
    });

    // Run dynamic bidirectional auto-scaling loop in Playwright browser
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const pageEl = document.querySelector('.resume') || document.querySelector('.page');
      if (!pageEl) return;

      const targetPages = parseInt(document.body.getAttribute('data-target-pages') || '1', 10);
      const maxAllowedHeight = targetPages * 1080;

      let minScale = 0.50;
      let maxScale = 1.45;
      let bestScale = 1.0;

      document.documentElement.style.setProperty('--scale-factor', '1.0');

      for (let i = 0; i < 30; i++) {
        let midScale = (minScale + maxScale) / 2;
        document.documentElement.style.setProperty('--scale-factor', midScale.toFixed(3));
        if (pageEl.scrollHeight <= maxAllowedHeight) {
          bestScale = midScale;
          minScale = midScale; // Fit succeeded: try scaling UP further to fill empty bottom space
        } else {
          maxScale = midScale; // Content overflowed page: scale DOWN
        }
      }

      document.documentElement.style.setProperty('--scale-factor', bestScale.toFixed(3));
    });

    await page.emulateMedia({
      media: "print",
    });

    await page.pdf({
      path: resolvedPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
      displayHeaderFooter: false,
      tagged: true,
    });

    return resolvedPath;
  } catch (error) {
    if (typeof logError === "function") {
      await logError("pdfRenderer.renderHtmlToPdf", error.message, error.stack);
    }
    throw new Error(`PDF rendering failed: ${error.message}`);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};
