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

    // Set flag to indicate this is a server-side PDF rendering run
    await page.evaluate(() => {
      window.isPdfRendering = true;
    });

    await page.setContent(htmlContent, {
      waitUntil: "networkidle",
    });

    await page.emulateMedia({
      media: "print",
    });

    // Run dynamic bidirectional auto-scaling loop in Playwright browser
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const pageEl = document.querySelector('.resume') || document.querySelector('.page');
      if (!pageEl) return;

      const targetPages = parseInt(document.body.getAttribute('data-target-pages') || '1', 10);

      // Measure real A4 page height in pixels by probing a 297mm element.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;height:297mm;width:1px;top:0;left:0;';
      document.body.appendChild(probe);
      const a4HeightPx = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);

      // Printable page height taking 12mm top + 12mm bottom page margins into account (273mm of 297mm)
      // We use 271mm (instead of 273mm) to provide a 2mm safety buffer for browser rendering differences.
      const printablePageHeightPx = (271.0 / 297) * a4HeightPx;

      // Reset to baseline and clear min-height for unconstrained measurement
      const prevMinHeight = pageEl.style.minHeight;
      pageEl.style.minHeight = '0px';

      // Set explicit A4 width to ensure wrapping is consistent during measurement
      pageEl.style.width = '210mm';

      const scaleMultiplier = parseFloat(document.body.getAttribute('data-scale-multiplier') || '1.0');

      document.documentElement.style.setProperty('--scale-factor', '1.0');
      await new Promise(r => requestAnimationFrame(r));

      /**
       * Robust page count detection by checking the bounding rect of the main container
       * after unconstraining its height.
       */
      const getRequiredPageCount = () => {
        const height = pageEl.getBoundingClientRect().height;
        return Math.ceil(height / printablePageHeightPx);
      };

      // Increased range for binary search: 0.30 to 2.00
      let minScale = 0.30;
      let maxScale = 2.00;
      let bestScale = 1.0;

      // Binary search: 40 iterations for ultra-high precision
      for (let i = 0; i < 40; i++) {
        const midScale = (minScale + maxScale) / 2;
        // Apply multiplier for fine-tuning
        const currentScale = midScale * scaleMultiplier;
        document.documentElement.style.setProperty('--scale-factor', currentScale.toFixed(5));

        const requiredPages = getRequiredPageCount();

        if (requiredPages <= targetPages) {
          bestScale = midScale;
          minScale = midScale;
        } else {
          maxScale = midScale;
        }
      }

      // Apply the best fitting scale with the multiplier
      const finalScale = bestScale * scaleMultiplier;
      document.documentElement.style.setProperty('--scale-factor', finalScale.toFixed(5));
      
      // Final verification: If still too high, force a slightly smaller scale as last resort
      if (getRequiredPageCount() > targetPages) {
        document.documentElement.style.setProperty('--scale-factor', (finalScale * 0.97).toFixed(5));
      }

      pageEl.style.minHeight = prevMinHeight;
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
