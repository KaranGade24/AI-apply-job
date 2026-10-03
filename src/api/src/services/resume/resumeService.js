/**
 * ResumeService: Parsing, text extraction, validation, and structured resume modeling
 */

import * as baseResumeService from '../resume.service.js';

export const parseResume = baseResumeService.parseResumeService;
export const getResumes = baseResumeService.getResumesService;
export const getResumeById = baseResumeService.getResumeByIdService;
export const deleteResume = baseResumeService.deleteResumeService;

export default {
  parseResume,
  getResumes,
  getResumeById,
  deleteResume,
};
