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
      const printablePageHeightPx = (273 / 297) * a4HeightPx;

      // Reset to baseline and clear min-height for unconstrained measurement
      const prevMinHeight = pageEl.style.minHeight;
      pageEl.style.minHeight = '0px';

      document.documentElement.style.setProperty('--scale-factor', '1.0');
      await new Promise(r => requestAnimationFrame(r));

      // Simulate exact page layout to determine required page count
      const getRequiredPageCount = () => {
        const blocks = Array.from(pageEl.querySelectorAll(
          '.resume-header, .header, .summary-text, .summary, .skill-row, .entry-item, .experience-item, .project, .education-item, .certifications, h2, .section-title, .project-description, .highlights'
        ));

        const leafBlocks = blocks.filter(b => !blocks.some(parent => parent !== b && parent.contains(b)));

        let currentPageHeight = 0;
        let pageCount = 1;

        for (let i = 0; i < leafBlocks.length; i++) {
          const el = leafBlocks[i];
          const rect = el.getBoundingClientRect();
          if (rect.height <= 0) continue;

          const style = window.getComputedStyle(el);
          const marginBottom = parseFloat(style.marginBottom || '0');
          const h = rect.height + marginBottom;

          if (currentPageHeight + h <= printablePageHeightPx) {
            currentPageHeight += h;
          } else {
            pageCount++;
            currentPageHeight = h;
          }
        }

        return pageCount;
      };

      let minScale = 0.50;
      let maxScale = 1.30;
      let bestScale = 1.0;

      // Binary search: 35 iterations gives high precision
      for (let i = 0; i < 35; i++) {
        const midScale = (minScale + maxScale) / 2;
        document.documentElement.style.setProperty('--scale-factor', midScale.toFixed(4));

        const requiredPages = getRequiredPageCount();

        if (requiredPages <= targetPages) {
          bestScale = midScale;
          minScale = midScale;
        } else {
          maxScale = midScale;
        }
      }

      document.documentElement.style.setProperty('--scale-factor', bestScale.toFixed(4));
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
