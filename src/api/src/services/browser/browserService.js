/**
 * BrowserService: High-level Browser Automation Service using use-browser-js
 */

import { UseBrowser, UseBrowserContext, UseBrowserPage, launch } from './useBrowserJs.js';
import { logJobEvent, logError } from '../../utils/logger.js';

export class BrowserService {
  constructor() {
    this.activeSessions = new Map();
  }

  async createSession(userId, options = {}) {
    try {
      const browser = await launch(options);
      const context = await browser.newContext(options);
      const page = await context.newPage();

      const session = {
        userId,
        browser,
        context,
        page,
        createdAt: new Date(),
        logs: [],
        screenshots: [],
      };

      this.activeSessions.set(userId, session);
      await logJobEvent('browserService', 'SESSION_CREATED', `Browser session created for user ${userId}`);
      return session;
    } catch (error) {
      await logError('browserService.createSession', error.message);
      throw error;
    }
  }

  getSession(userId) {
    return this.activeSessions.get(userId);
  }

  async closeSession(userId) {
    const session = this.activeSessions.get(userId);
    if (session) {
      await session.page?.close().catch(() => {});
      await session.context?.close().catch(() => {});
      await session.browser?.close().catch(() => {});
      this.activeSessions.delete(userId);
      await logJobEvent('browserService', 'SESSION_CLOSED', `Browser session closed for user ${userId}`);
    }
  }

  async openWebsite(userId, url, options = {}) {
    let session = this.getSession(userId);
    if (!session) {
      session = await this.createSession(userId, options);
    }
    return await session.page.goto(url, options);
  }

  async captureScreenshot(userId, options = {}) {
    const session = this.getSession(userId);
    if (!session?.page) return null;
    return await session.page.screenshot(options);
  }
}

export const browserService = new BrowserService();
export default browserService;
