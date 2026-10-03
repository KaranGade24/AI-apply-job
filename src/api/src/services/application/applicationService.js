/**
 * ApplicationService: Core application management logic
 */

import { Application } from '../../model/Application.js';
import * as baseAppService from '../application.service.js';

export const getApplications = baseAppService.getApplicationsService;
export const getApplicationById = baseAppService.getApplicationByIdService;
export const createApplication = baseAppService.createApplicationService;
export const updateApplicationStatus = baseAppService.updateApplicationStatusService;

export default {
  getApplications,
  getApplicationById,
  createApplication,
  updateApplicationStatus,
};
