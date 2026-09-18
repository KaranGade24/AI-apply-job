import fs from "fs/promises";
import path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { logError } from "../../utils/logger.js";

/**
 * Clean extracted resume text.
 */
const cleanResumeText = (text) => {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
};

/**
 * Normalize an extracted URL.
 *
 * Only http, https and mailto URLs are accepted.
 */
const normalizeUrl = (url) => {
  if (typeof url !== "string") {
    return "";
  }

  const value = url.trim();

  if (!value) {
    return "";
  }

  try {
    const parsedUrl = new URL(value);

    if (!["http:", "https:", "mailto:"].includes(parsedUrl.protocol)) {
      return "";
    }

    return parsedUrl.href;
  } catch {
    return "";
  }
};

/**
 * Extract embedded hyperlinks from PDF page information.
 */
const extractPdfHyperlinks = (pages = []) => {
  return pages
    .flatMap((page) => {
      if (!Array.isArray(page.links)) {
        return [];
      }

      return page.links.map((link) => ({
        pageNumber: page.pageNumber,
        text: link.text || "",
        url: normalizeUrl(link.url),
      }));
    })
    .filter((link) => link.url);
};

/**
 * Classify important resume-level hyperlinks.
 *
 * These values come directly from the PDF.
 * No URL is generated or guessed here.
 */
const classifyResumeLinks = (hyperlinks = []) => {
  const result = {
    email: "",
    linkedin: "",
    github: "",
    website: "",
  };

  for (const link of hyperlinks) {
    const text = (link.text || "").toLowerCase();
    const url = (link.url || "").toLowerCase();

    /*
     * Email
     */
    if (url.startsWith("mailto:") && !result.email) {
      result.email = link.url.replace(/^mailto:/i, "");
      continue;
    }

    /*
     * LinkedIn
     */
    if (url.includes("linkedin.com/in/") && !result.linkedin) {
      result.linkedin = link.url;
      continue;
    }

    /*
     * GitHub
     */
    if (url.includes("github.com/") && !result.github) {
      result.github = link.url;
      continue;
    }

    /*
     * Portfolio / personal website
     *
     * Give explicit portfolio text priority.
     */
    if (
      (text.includes("portfolio") || text.includes("website")) &&
      !result.website
    ) {
      result.website = link.url;
    }
  }

  /*
   * Fallback:
   *
   * If no explicit portfolio/website link exists,
   * use the first remaining HTTP/HTTPS link.
   */
  if (!result.website) {
    const fallbackWebsite = hyperlinks.find((link) => {
      const url = (link.url || "").toLowerCase();

      return (
        (url.startsWith("http://") || url.startsWith("https://")) &&
        !url.includes("linkedin.com/") &&
        !url.includes("github.com/")
      );
    });

    if (fallbackWebsite) {
      result.website = fallbackWebsite.url;
    }
  }

  return result;
};

/**
 * Extract resume text and embedded hyperlinks.
 *
 * PDF:
 * - Visible text
 * - Embedded hyperlinks
 * - Classified contact links
 *
 * Non-PDF:
 * - Plain text
 * - No embedded hyperlinks
 */
export const extractResumeText = async (filePath) => {
  try {
    if (!filePath) {
      throw new Error("File path is required for resume parsing");
    }

    /*
     * Resolve file path.
     */
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    /*
     * Read file.
     */
    const fileBuffer = await fs.readFile(resolvedPath);

    const ext = path.extname(resolvedPath).toLowerCase();

    /*
     * Default result shape.
     */
    let resumeData = {
      text: "",
      hyperlinks: [],
      resumeLinks: {
        email: "",
        linkedin: "",
        github: "",
        website: "",
      },
    };

    /*
     * ==========================================
     * PDF
     * ==========================================
     */
    if (ext === ".pdf") {
      const parser = new PDFParse({
        data: fileBuffer,
      });

      try {
        /*
         * Extract readable text.
         */
        const textData = await parser.getText({
          parseHyperlinks: true,
        });

        /*
         * Extract PDF page information.
         *
         * This gives us embedded annotations/links.
         */
        const infoData = await parser.getInfo({
          parsePageInfo: true,
        });

        /*
         * Clean extracted text.
         */
        const cleanedText = cleanResumeText(textData.text || "");

        /*
         * Extract embedded hyperlinks.
         */
        const hyperlinks = extractPdfHyperlinks(infoData.pages || []);

        /*
         * Classify contact/profile links.
         */
        const resumeLinks = classifyResumeLinks(hyperlinks);

        /*
         * Final structured result.
         */
        resumeData = {
          text: cleanedText,
          hyperlinks,
          resumeLinks,
        };
      } finally {
        /*
         * Always release parser resources.
         */
        await parser.destroy();
      }
    } else {

    /*
     * ==========================================
     * NON-PDF
     * ==========================================
     */
      const cleanedText = cleanResumeText(fileBuffer.toString("utf-8"));

      resumeData = {
        text: cleanedText,
        hyperlinks: [],
        resumeLinks: {
          email: "",
          linkedin: "",
          github: "",
          website: "",
        },
      };
    }

    /*
     * ==========================================
     * VALIDATION
     * ==========================================
     */
    if (!resumeData.text) {
      throw new Error(
        "No readable text content could be extracted from the resume file",
      );
    }

    /*
     * ==========================================
     * DEBUG LOGGING
     * ==========================================
     */
    console.log("\n========== RESUME TEXT ==========\n");

    console.log(resumeData.text);

    console.log("\n========== PDF HYPERLINKS ==========\n");

    console.dir(resumeData.hyperlinks, {
      depth: null,
    });

    console.log("\n========== RESUME LINKS ==========\n");

    console.dir(resumeData.resumeLinks, {
      depth: null,
    });

    console.log("\n========== COMPLETE RESUME DATA ==========\n");

    console.dir(resumeData, {
      depth: null,
    });

    /*
     * IMPORTANT:
     *
     * Your previous code was missing this return.
     */
    return resumeData;
  } catch (error) {
    await logError("extractResumeText", error.message, error.stack);

    throw new Error(`Failed to extract resume data: ${error.message}`);
  }
};

/**
 * LangChain Tool wrapper for resume parsing.
 */
export const resumeParseTool = tool(
  async ({ filePath }) => {
    const resumeData = await extractResumeText(filePath);

    return JSON.stringify(
      {
        filePath,
        ...resumeData,
      },
      null,
      2,
    );
  },
  {
    name: "resumeParseTool",

    description:
      "Extracts readable resume text and embedded PDF hyperlinks. " +
      "Returns the original PDF URLs when available. " +
      "Does not invent, modify, or search for URLs.",

    schema: z.object({
      filePath: z.string().describe("Local path of the uploaded resume file"),
    }),
  },
);

export default resumeParseTool;
