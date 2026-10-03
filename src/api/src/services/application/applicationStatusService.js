/**
 * ApplicationStatusService: Application state transitions & timeline event logger
 */

import { Application } from '../../model/Application.js';

export class ApplicationStatusService {
  static async updateStatus(applicationId, newStatus, eventMetadata = {}) {
    const application = await Application.findById(applicationId);
    if (!application) throw new Error('Application not found');

    application.status = newStatus;
    if (newStatus === 'SUBMITTED') {
      application.submittedAt = new Date();
    }
    await application.save();

    return application;
  }
}

export default ApplicationStatusService;
