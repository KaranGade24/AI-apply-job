import { BrowserManager } from './browserManager.js';
import { attachDialogHandler } from './dialogHandler.js';
import { BrowserSessionRepository } from '../../../repositories/browserSession.repository.js';
import { ApplicationSessionRepository } from '../../../repositories/applicationSession.repository.js';
import { JobApplication } from '../../../model/JobApplication.js';
import { SESSION_TTL_MS } from '../../../constant/agent.constant.js';
import { logError, logJobEvent } from '../../../utils/logger.js';

/**
 * In-memory map storing active browser sessions.
 * Key: applicationId (string) -> Value: SessionEntry
 * @type {Map<string, {
 *   applicationId: string,
 *   userId: string,
 *   context: import('playwright').BrowserContext,
 *   activePage: import('playwright').Page,
 *   pages: Array<import('playwright').Page>,
 *   currentUrl: string,
 *   createdAt: Date,
 *   lastUsedAt: Date
 * }>}
 */
const activeSessions = new Map();

let ttlCleanupInterval = null;

/**
 * Attaches multi-tab event listeners and navigation tracking to a page.
 *
 * @param {object} session
 * @param {import('playwright').Page} page
 */
const attachPageTracking = (session, page) => {
  if (!page || typeof page.on !== 'function') return;

  // Track dialog events safely
  attachDialogHandler(page, session.applicationId);

  // Track frame navigation and redirects
  page.on('framenavigated', (frame) => {
    try {
      if (frame === page.mainFrame()) {
        const url = page.url();
        session.currentUrl = url;
        session.lastUsedAt = new Date();

        // Update current URL in DB asynchronously
        if (session.applicationId) {
          ApplicationSessionRepository.updateSession(session.applicationId, session.userId, {
            currentUrl: url,
          }).catch(() => {});
        }
      }
    } catch {
      // Non-blocking
    }
  });

  // Track tab closing
  page.on('close', () => {
    try {
      session.pages = session.pages.filter((p) => p !== page);
      if (session.activePage === page) {
        session.activePage = session.pages[session.pages.length - 1] || null;
      }
      session.lastUsedAt = new Date();
    } catch {
      // Non-blocking
    }
  });
};

/**
 * SessionRegistry manages in-memory browser contexts, multi-tab routing, TTL cleanup, and recovery.
 */
export class SessionRegistry {
  /**
   * Retrieves an existing session or creates a new isolated browser context and page.
   *
   * @param {string} applicationId
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<{
   *   applicationId: string,
   *   userId: string,
   *   context: import('playwright').BrowserContext,
   *   activePage: import('playwright').Page,
   *   pages: Array<import('playwright').Page>,
   *   currentUrl: string,
   *   createdAt: Date,
   *   lastUsedAt: Date
   * }>}
   */
  static async createOrGetSession(applicationId, userId, options = {}) {
    const appIdStr = String(applicationId);
    const existing = activeSessions.get(appIdStr);

    if (existing && existing.context) {
      existing.lastUsedAt = new Date();
      // Ensure activePage is open
      if (!existing.activePage || (typeof existing.activePage.isClosed === 'function' && existing.activePage.isClosed())) {
        existing.activePage = existing.pages.find((p) => !p.isClosed()) || (await existing.context.newPage());
        if (!existing.pages.includes(existing.activePage)) {
          existing.pages.push(existing.activePage);
          attachPageTracking(existing, existing.activePage);
        }
      }
      return existing;
    }

    try {
      const context = await BrowserManager.createApplicationContext(appIdStr, options);
      const activePage = await context.newPage();

      const sessionEntry = {
        applicationId: appIdStr,
        userId: String(userId || ''),
        context,
        activePage,
        pages: [activePage],
        currentUrl: activePage.url() || '',
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      // Multi-tab handling: listen to new tabs and popups opened by target site
      if (typeof context.on === 'function') {
        context.on('page', (newPage) => {
          if (!sessionEntry.pages.includes(newPage)) {
            sessionEntry.pages.push(newPage);
          }
          sessionEntry.activePage = newPage;
          sessionEntry.lastUsedAt = new Date();
          attachPageTracking(sessionEntry, newPage);
          logJobEvent(
            'sessionRegistry',
            'NEW_TAB_TRACKED',
            `[application:${appIdStr}] New browser tab/popup tracked. Active tabs count: ${sessionEntry.pages.length}`
          );
        });
      }

      attachPageTracking(sessionEntry, activePage);
      activeSessions.set(appIdStr, sessionEntry);

      this.ensureTtlCleanupStarted();

      await logJobEvent(
        'sessionRegistry',
        'SESSION_INITIALIZED',
        `[application:${appIdStr}] Browser session initialized in registry`
      );

      return sessionEntry;
    } catch (error) {
      await logError('SessionRegistry.createOrGetSession', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Retrieves an existing in-memory session.
   *
   * @param {string} applicationId
   * @returns {object|null}
   */
  static getSession(applicationId) {
    const session = activeSessions.get(String(applicationId));
    if (session) {
      session.lastUsedAt = new Date();
    }
    return session || null;
  }

  /**
   * Returns the currently active page (tab) for an application.
   *
   * @param {string} applicationId
   * @returns {import('playwright').Page|null}
   */
  static getActivePage(applicationId) {
    const session = this.getSession(applicationId);
    if (!session) return null;

    if (session.activePage && (typeof session.activePage.isClosed !== 'function' || !session.activePage.isClosed())) {
      return session.activePage;
    }

    // Fallback to latest unclosed page in pages array
    const validPage = session.pages.slice().reverse().find((p) => typeof p.isClosed !== 'function' || !p.isClosed());
    session.activePage = validPage || null;
    return session.activePage;
  }

  /**
   * Switches the active page (tab) in the session.
   *
   * @param {string} applicationId
   * @param {number|import('playwright').Page|Function|string} target - Page index, Page instance, predicate fn, or URL substring
   * @returns {Promise<import('playwright').Page|null>}
   */
  static async switchToPage(applicationId, target) {
    const session = this.getSession(applicationId);
    if (!session || !session.pages.length) return null;

    let targetPage = null;

    if (typeof target === 'number') {
      targetPage = session.pages[target] || null;
    } else if (typeof target === 'object' && target !== null) {
      targetPage = session.pages.find((p) => p === target) || null;
    } else if (typeof target === 'function') {
      targetPage = session.pages.find(target) || null;
    } else if (typeof target === 'string') {
      targetPage = session.pages.find((p) => {
        try {
          return p.url().includes(target);
        } catch {
          return false;
        }
      }) || null;
    }

    if (targetPage && (typeof targetPage.isClosed !== 'function' || !targetPage.isClosed())) {
      session.activePage = targetPage;
      session.lastUsedAt = new Date();
      if (typeof targetPage.bringToFront === 'function') {
        await targetPage.bringToFront().catch(() => {});
      }
      return targetPage;
    }

    return session.activePage;
  }

  /**
   * Recreates a session after a server restart from DB state.
   * Opens a fresh context at ApplicationSession.currentUrl (or fallback URL).
   *
   * @param {string} applicationId
   * @param {string} userId
   * @param {string} [fallbackUrl]
   * @returns {Promise<object>}
   */
  static async recreateSession(applicationId, userId, fallbackUrl = '') {
    try {
      const appIdStr = String(applicationId);
      // Retrieve last known URL from DB
      let targetUrl = fallbackUrl;

      if (!targetUrl) {
        const appSession = await ApplicationSessionRepository.findSessionByApplicationId(appIdStr, userId);
        if (appSession?.currentUrl) {
          targetUrl = appSession.currentUrl;
        }
      }

      if (!targetUrl) {
        const jobApp = await JobApplication.findById(appIdStr).lean();
        targetUrl = jobApp?.applyUrl || jobApp?.pageAnalysis?.currentUrl || '';
      }

      await logJobEvent(
        'sessionRegistry',
        'SESSION_RECOVERY_START',
        `[application:${appIdStr}] Recreating browser session post-restart at target URL: "${targetUrl || 'about:blank'}"`
      );

      const session = await this.createOrGetSession(appIdStr, userId);

      if (targetUrl && session.activePage) {
        await session.activePage.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch((err) => {
          logError('SessionRegistry.recreateSession.goto', err.message);
        });
        session.currentUrl = session.activePage.url() || targetUrl;
      }

      return session;
    } catch (error) {
      await logError('SessionRegistry.recreateSession', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Closes an application browser session, persists encrypted storage state to DB, and cleans up memory.
   *
   * @param {string} applicationId
   * @returns {Promise<void>}
   */
  static async closeSession(applicationId) {
    const appIdStr = String(applicationId);
    const session = activeSessions.get(appIdStr);
    if (!session) return;

    activeSessions.delete(appIdStr);

    try {
      // Capture and encrypt storageState before closing
      if (session.context && typeof session.context.storageState === 'function') {
        const storageState = await session.context.storageState().catch(() => null);
        if (storageState) {
          await BrowserSessionRepository.saveStorageState(appIdStr, storageState);
        }
      }

      // Close all open pages
      for (const page of session.pages || []) {
        if (page && typeof page.close === 'function') {
          await page.close().catch(() => {});
        }
      }

      // Close context
      if (session.context && typeof session.context.close === 'function') {
        await session.context.close().catch(() => {});
      }

      await logJobEvent(
        'sessionRegistry',
        'SESSION_CLOSED',
        `[application:${appIdStr}] Browser session closed and storageState persisted`
      );
    } catch (error) {
      await logError('SessionRegistry.closeSession', error.message);
    }
  }

  /**
   * Closes all active sessions and shuts down the shared browser.
   *
   * @returns {Promise<void>}
   */
  static async closeAllSessions() {
    if (ttlCleanupInterval) {
      clearInterval(ttlCleanupInterval);
      ttlCleanupInterval = null;
    }

    const sessionKeys = Array.from(activeSessions.keys());
    for (const key of sessionKeys) {
      await this.closeSession(key);
    }
    activeSessions.clear();
    await BrowserManager.closeSharedBrowser();
  }

  /**
   * Starts background TTL cleanup if not already running.
   */
  static ensureTtlCleanupStarted() {
    if (ttlCleanupInterval) return;

    const CHECK_INTERVAL_MS = 60000; // Run check every minute
    const ttlLimit = SESSION_TTL_MS || 24 * 60 * 60 * 1000;

    ttlCleanupInterval = setInterval(async () => {
      const now = Date.now();
      for (const [appId, session] of activeSessions.entries()) {
        const idleTime = now - session.lastUsedAt.getTime();
        if (idleTime > ttlLimit) {
          await logJobEvent(
            'sessionRegistry',
            'SESSION_TTL_EXPIRED',
            `[application:${appId}] Inactive session expired after ${Math.round(idleTime / 1000)}s. Evicting.`
          );
          await SessionRegistry.closeSession(appId);
        }
      }
    }, CHECK_INTERVAL_MS);

    if (typeof ttlCleanupInterval.unref === 'function') {
      ttlCleanupInterval.unref();
    }
  }

  /**
   * Registers graceful shutdown hooks for SIGINT and SIGTERM.
   *
   * @param {import('http').Server} [server]
   */
  static setupShutdownHooks(server = null) {
    const handleShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully closing all browser sessions...`);
      try {
        await SessionRegistry.closeAllSessions();
      } catch (err) {
        console.error('Error during browser sessions shutdown:', err);
      }
      if (server && typeof server.close === 'function') {
        server.close(() => process.exit(0));
      } else {
        process.exit(0);
      }
    };

    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  }
}

export default SessionRegistry;
