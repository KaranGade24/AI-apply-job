import fs from "fs/promises";
import path from "path";
import Handlebars from "handlebars";
import { prepareResumeData } from "./prepareResumeData.js";
import { logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * ResumeRenderer Orchestrator
 * Takes resumeData, prepares it, loads section templates & CSS theme, and compiles layout HTML
 */
export class ResumeRenderer {
  /**
   * Render resume to HTML string
   * @param {object} resumeData - Raw or tailored resume data object
   * @param {string} [themeName='modern'] - Theme folder name under templates/
   * @returns {Promise<string>} Full HTML document string
   */
  async render(resumeData, themeName = "modern") {
    try {
      const preparedData = prepareResumeData(resumeData);

      const templatesDir = path.resolve(process.cwd(), "src/api/src/pdf/templates", themeName);

      // Load theme CSS and layout template
      const themeCssPath = path.join(templatesDir, "theme.css");
      const layoutHtmlPath = path.join(templatesDir, "layout.html");

      const [themeCss, layoutHtml] = await Promise.all([
        fs.readFile(themeCssPath, "utf-8").catch(() => ""),
        fs.readFile(layoutHtmlPath, "utf-8"),
      ]);

      const sectionNames = [
        "header",
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
      ];

      const sections = {};

      // Load and compile each section template asynchronously
      await Promise.all(
        sectionNames.map(async (section) => {
          const sectionPath = path.join(templatesDir, "sections", `${section}.html`);
          try {
            const sectionTemplateStr = await fs.readFile(sectionPath, "utf-8");
            const compiledSection = Handlebars.compile(sectionTemplateStr);
            sections[section] = compiledSection(preparedData);
          } catch (err) {
            sections[section] = "";
          }
        })
      );

      // Compile master layout template
      const compiledLayout = Handlebars.compile(layoutHtml);
      const finalHtml = compiledLayout({
        ...preparedData,
        themeCss,
        sections,
      });

      return finalHtml;
    } catch (error) {
      await logError("ResumeRenderer.render", error.message);
      throw new appError(`Resume HTML rendering failed: ${error.message}`, 500);
    }
  }
}

export const resumeRenderer = new ResumeRenderer();
