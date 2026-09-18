import fs from 'fs/promises';
import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import pdfParse from 'pdf-parse';
import { logError } from '../../utils/logger.js';

/**
 * Tool function to extract raw text content from a resume file stored in resume_temp
 */
export const extractResumeText = async (filePath) => {
  try {
    if (!filePath) {
      throw new Error('File path is required for resume parsing');
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();

    let extractedText = '';

    if (ext === '.pdf') {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text || '';
    } else {
      // For plain text, markdown or doc/docx basic text extraction
      extractedText = fileBuffer.toString('utf-8');
    }

    // Clean up excessive whitespace
    const cleanedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    if (!cleanedText) {
      throw new Error('No readable text content could be extracted from the resume file');
    }

    return cleanedText;
  } catch (error) {
    await logError('extractResumeText', error.message, error.stack);
    throw new Error(`Failed to extract text from resume file: ${error.message}`);
  }
};

/**
 * LangChain Tool wrapper for resume parsing
 */
export const resumeParseTool = tool(
  async ({ filePath }) => {
    const text = await extractResumeText(filePath);
    return JSON.stringify({ filePath, extractedText: text });
  },
  {
    name: 'resume_parse_tool',
    description: 'Extracts all raw readable text from a resume file given its local file path',
    schema: z.object({
      filePath: z.string().describe('Local file path of the uploaded resume in the resume_temp folder')
    })
  }
);

export default resumeParseTool;
