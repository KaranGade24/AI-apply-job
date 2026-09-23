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

      // Measure real A4 page height in pixels by probing a 297mm element.
      // This is accurate regardless of browser DPI / zoom settings.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;height:297mm;width:1px;top:0;left:0;';
      document.body.appendChild(probe);
      const a4HeightPx = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);

      const maxAllowedHeight = targetPages * a4HeightPx;

      // Measure content height at scale 1.0 baseline
      document.documentElement.style.setProperty('--scale-factor', '1.0');
      // Allow a reflow tick
      await new Promise(r => requestAnimationFrame(r));

      let minScale = 0.45;
      let maxScale = 1.50;
      let bestScale = 1.0;

      // Binary search: 35 iterations gives ~0.002 precision
      for (let i = 0; i < 35; i++) {
        const midScale = (minScale + maxScale) / 2;
        document.documentElement.style.setProperty('--scale-factor', midScale.toFixed(4));

        // Measure the actual content height inside the resume container
        const contentHeight = pageEl.scrollHeight;

        if (contentHeight <= maxAllowedHeight) {
          // Content fits: record this as a valid scale and try scaling UP to fill empty space
          bestScale = midScale;
          minScale = midScale;
        } else {
          // Content overflows: scale DOWN
          maxScale = midScale;
        }
      }

      document.documentElement.style.setProperty('--scale-factor', bestScale.toFixed(4));
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
