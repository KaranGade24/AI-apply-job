import fs from "fs/promises";
import path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { logError, logResumeEvent } from "../../utils/logger.js";

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
 * Extract text and embedded hyperlinks from DOCX using mammoth.
 */
const extractDocxData = async (fileBuffer) => {
  // 1. Extract raw text
  const textResult = await mammoth.extractRawText({ buffer: fileBuffer });
  const cleanedText = cleanResumeText(textResult.value || "");

  // 2. Extract HTML to find embedded hyperlinks
  const htmlResult = await mammoth.convertToHtml({ buffer: fileBuffer });
  const html = htmlResult.value || "";

  const hyperlinks = [];
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, "").trim();
    const url = normalizeUrl(rawUrl);
    if (url) {
      hyperlinks.push({
        pageNumber: 1,
        text: rawText,
        url,
      });
    }
  }

  return {
    text: cleanedText,
    hyperlinks,
  };
};

/**
 * Classify hyperlinks into candidateLinks and projectLinks.
 *
 * Candidate links:
 * - email
 * - linkedin
 * - github (personal profile)
 * - website / portfolio
 *
 * Project links:
 * - GitHub repo URLs (github.com/user/repo)
 * - Live demo URLs (vercel, netlify, custom domain, "Live Demo", "Demo")
 */
const classifyHyperlinks = (hyperlinks = []) => {
  const candidateLinks = {
    email: "",
    linkedin: "",
    github: "",
    website: "",
  };

  const projectLinks = [];

  for (const link of hyperlinks) {
    const text = (link.text || "").trim();
    const textLower = text.toLowerCase();
    const url = link.url;
    const urlLower = (url || "").toLowerCase();

    // 1. Email (mailto: or regex)
    if (urlLower.startsWith("mailto:") && !candidateLinks.email) {
      candidateLinks.email = url.replace(/^mailto:/i, "");
      continue;
    }

    // 2. LinkedIn
    if (urlLower.includes("linkedin.com/in/") && !candidateLinks.linkedin) {
      candidateLinks.linkedin = url;
      continue;
    }

    // 3. GitHub: Distinguish personal profile vs project repository
    if (urlLower.includes("github.com/")) {
      // Check if it's a specific repo: github.com/<user>/<repo> (more than 1 path segment)
      try {
        const parsed = new URL(url);
        const pathSegments = parsed.pathname.split("/").filter(Boolean);

        if (pathSegments.length >= 2) {
          // This is a project repository link!
          projectLinks.push({
            linkText: text || "GitHub Repository",
            url,
            type: "github",
            pageNumber: link.pageNumber || null,
          });
          continue;
        } else if (pathSegments.length === 1 && !candidateLinks.github) {
          // This is candidate's personal GitHub profile
          candidateLinks.github = url;
          continue;
        }
      } catch {
        // Fallback check
      }
    }

    // 4. Live Demo indicators
    const isLiveDemoText = /live|demo|preview|app|visit|view/i.test(textLower);
    const isLiveDemoHost = /vercel\.app|netlify\.app|herokuapp\.com|render\.com|github\.io|pages\.dev|firebaseapp\.com|onrender\.com|fly\.dev/i.test(urlLower);

    if (isLiveDemoText || isLiveDemoHost) {
      projectLinks.push({
        linkText: text || "Live Demo",
        url,
        type: "liveDemo",
        pageNumber: link.pageNumber || null,
      });
      continue;
    }

    // 5. Portfolio / personal website
    if ((textLower.includes("portfolio") || textLower.includes("website") || textLower.includes("personal")) && !candidateLinks.website) {
      candidateLinks.website = url;
      continue;
    }

    // 6. Generic project or other HTTP link
    if (urlLower.startsWith("http://") || urlLower.startsWith("https://")) {
      if (!candidateLinks.website && !urlLower.includes("linkedin.com") && !urlLower.includes("github.com")) {
        candidateLinks.website = url;
      } else {
        projectLinks.push({
          linkText: text || "Project Link",
          url,
          type: "other",
          pageNumber: link.pageNumber || null,
        });
      }
    }
  }

  return {
    candidateLinks,
    projectLinks,
  };
};

/**
 * Extract resume text and embedded hyperlinks from supported file types.
 *
 * Supported formats:
 * - .pdf  (pdf-parse + embedded hyperlinks)
 * - .docx (mammoth + html hyperlink extraction)
 * - .txt  (direct clean text)
 *
 * Legacy .doc files are rejected with a helpful message.
 */
export const extractResumeText = async (filePath) => {
  try {
    if (!filePath) {
      throw new Error("File path is required for resume parsing");
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    const ext = path.extname(resolvedPath).toLowerCase();

    if (ext === ".doc") {
      throw new Error(
        "Legacy binary .doc files are not supported. Please save or export your resume as .pdf or .docx and upload again."
      );
    }

    const fileBuffer = await fs.readFile(resolvedPath);

    let rawText = "";
    let hyperlinks = [];

    if (ext === ".pdf") {
      const parser = new PDFParse({ data: fileBuffer });
      try {
        const textData = await parser.getText({ parseHyperlinks: true });
        const infoData = await parser.getInfo({ parsePageInfo: true });

        rawText = cleanResumeText(textData.text || "");
        hyperlinks = extractPdfHyperlinks(infoData.pages || []);
      } finally {
        await parser.destroy();
      }
    } else if (ext === ".docx") {
      const docxData = await extractDocxData(fileBuffer);
      rawText = docxData.text;
      hyperlinks = docxData.hyperlinks;
    } else if (ext === ".txt") {
      rawText = cleanResumeText(fileBuffer.toString("utf-8"));
      hyperlinks = [];
    } else {
      throw new Error(
        `Unsupported file extension '${ext}'. Supported extensions are .pdf, .docx, and .txt.`
      );
    }

    if (!rawText || !rawText.trim()) {
      throw new Error(
        "No readable text content could be extracted from the resume file"
      );
    }

    // Classify into candidateLinks and projectLinks
    const { candidateLinks, projectLinks } = classifyHyperlinks(hyperlinks);

    const resumeData = {
      text: rawText,
      hyperlinks,
      candidateLinks,
      projectLinks,
      // Backward-compatible alias for resumeLinks
      resumeLinks: candidateLinks,
    };

    // Log structured event without leaking sensitive full resume text
    await logResumeEvent(
      filePath,
      "EXTRACTED",
      `Extracted ${rawText.length} characters, ${hyperlinks.length} hyperlinks, ${projectLinks.length} project links (${ext})`
    );

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
      2
    );
  },
  {
    name: "resumeParseTool",
    description:
      "Extracts readable resume text, candidate links, and embedded project hyperlinks from PDF, DOCX, or TXT. " +
      "Returns exact original URLs without inventing or hallucinating.",
    schema: z.object({
      filePath: z.string().describe("Local path of the uploaded resume file"),
    }),
  }
);

export default resumeParseTool;
