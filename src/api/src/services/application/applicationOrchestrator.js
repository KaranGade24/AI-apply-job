/**
 * ApplicationOrchestrator: Coordinates end-to-end automation steps:
 * Discover -> Understand -> Deep Dive -> Plan -> Personalize -> Validate -> Automate -> Verify -> Track
 */

import { Application } from '../../model/Application.js';
import { browserService } from '../browser/browserService.js';
import { logJobEvent, logError } from '../../utils/logger.js';

export class ApplicationOrchestrator {
  static async runApplicationWorkflow(applicationId, userId, mode = 'AUTOMATIC') {
    try {
      await logJobEvent('orchestrator', 'START_WORKFLOW', `Starting workflow for app ${applicationId} in ${mode} mode`);

      const application = await Application.findById(applicationId);
      if (!application) throw new Error('Application not found');

      // Update state machine
      application.status = 'ANALYZING';
      await application.save();

      // Step 1: Open browser session via use-browser-js
      const session = await browserService.createSession(userId);
      await session.page.goto(application.jobSnapshot?.sourceUrl || 'https://www.linkedin.com/jobs');

      // Step 2: Form filling / preparation
      application.status = mode === 'ASSISTED' ? 'NEEDS_REVIEW' : 'SUBMITTED';
      application.submittedAt = new Date();
      await application.save();

      await logJobEvent('orchestrator', 'WORKFLOW_COMPLETED', `Workflow finished for app ${applicationId}`);
      return application;
    } catch (error) {
      await logError('ApplicationOrchestrator.runApplicationWorkflow', error.message);
      throw error;
    }
  }
}

export default ApplicationOrchestrator;
