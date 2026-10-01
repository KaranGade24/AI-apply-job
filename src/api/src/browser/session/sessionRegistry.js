import path from 'path';
import os from 'os';
import fs from 'fs';
import { BrowserManager } from '../browserManager.js';
import { encryptValue, decryptValue } from '../../utils/encryption.js';
import { logJobEvent, logError } from '../../utils/logger.js';

const sessions = new Map();
const MAX_SESSIONS_PER_USER = 3;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Validates URLs for safety.
 * Block private IPs, loopbacks, and safe protocols.
 */
export const isSafeUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]' ||
      hostname === '::1'
    ) {
      return false;
    }
    // Block private IP ranges
    if (hostname.startsWith('10.')) return false;
    if (hostname.startsWith('192.168.')) return false;
    if (hostname.startsWith('172.')) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Wait until page finishes loading, network requests settle, and DOM quiet period is observed.
 */
export const waitForSettled = async (page, timeoutMs = 8000) => {
  try {
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {}),
      page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    ]);

    await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        let timer = null;
        const maxTimeoutTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, timeout);

        const observer = new MutationObserver(() => {
          resetTimer();
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true
        });

        const resetTimer = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cleanup();
            resolve();
          }, 400);
        };

        const cleanup = () => {
          observer.disconnect();
          clearTimeout(maxTimeoutTimer);
          if (timer) clearTimeout(timer);
        };

        resetTimer();
      });
    }, timeoutMs).catch(() => {});
  } catch (err) {
    // ignore
  }
};

/**
 * Creates an active browser session with tab-tracking, dialogue-handling, and download exposure.
 */
export const createSession = async (applicationId, ownerUserId, options = {}) => {
  try {
    // 1. Enforce user concurrency limit
    const userSessions = Array.from(sessions.entries()).filter(([_, s]) => s.ownerUserId === ownerUserId);
    if (userSessions.length >= MAX_SESSIONS_PER_USER) {
      userSessions.sort((a, b) => a[1].createdAt - b[1].createdAt);
      const [oldestAppId, _] = userSessions[0];
      await closeSession(oldestAppId);
    }

    // 2. Handle decrypted storageState options
    let decryptedStorageState = null;
    if (options.storageState) {
      try {
        if (typeof options.storageState === 'object' && options.storageState.cipherText) {
          decryptedStorageState = JSON.parse(decryptValue(options.storageState));
        } else {
          decryptedStorageState = options.storageState;
        }
      } catch (err) {
        decryptedStorageState = options.storageState;
      }
    }

    // 3. Launch browser and context
    const browser = await BrowserManager.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      acceptDownloads: true,
      storageState: decryptedStorageState || undefined
    });

    const session = {
      browser,
      context,
      tabs: [],
      activeTabId: null,
      dialogs: [],
      downloads: [],
      redirectReports: [],
      ownerUserId,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    // 4. Dialogue handling (auto-dismiss and logging)
    context.on('dialog', async (dialog) => {
      session.dialogs.push({
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
        timestamp: Date.now()
      });

      if (dialog.type() === 'confirm') {
        await dialog.dismiss().catch(() => {});
      } else {
        await dialog.accept().catch(() => {});
      }
    });

    // 5. Tab Tracking
    context.on('page', async (newPage) => {
      const tabId = 'tab_' + Math.random().toString(36).substring(2, 11);
      
      await newPage.waitForLoadState('domcontentloaded').catch(() => {});

      const tabObj = {
        id: tabId,
        page: newPage,
        url: newPage.url(),
        title: await newPage.title().catch(() => '') || 'Untitled',
        domain: ''
      };

      try {
        tabObj.domain = new URL(tabObj.url).hostname;
      } catch {
        // ignore
      }

      session.tabs.push(tabObj);
      session.activeTabId = tabId;

      // Track redirects & frame-navigated events
      newPage.on('framenavigated', async (frame) => {
        if (frame === newPage.mainFrame()) {
          const oldDomain = tabObj.domain;
          const newUrl = newPage.url();
          let newDomain = '';
          try {
            newDomain = new URL(newUrl).hostname;
          } catch {
            // ignore
          }
          
          tabObj.url = newUrl;
          tabObj.title = await newPage.title().catch(() => '') || 'Untitled';
          tabObj.domain = newDomain;

          if (oldDomain && newDomain && oldDomain !== newDomain) {
            session.redirectReports.push({
              tabId,
              fromDomain: oldDomain,
              toDomain: newDomain,
              url: newUrl,
              timestamp: Date.now()
            });
            await logJobEvent('tabTracking', 'DOMAIN_REDIRECT', `Tab ${tabId} redirected from ${oldDomain} to ${newDomain}`);
          }
        }
      });

      // Download handling
      newPage.on('download', async (download) => {
        try {
          const tempDir = path.join(os.tmpdir(), 'ai-apply-downloads');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const filePath = path.join(tempDir, download.suggestedFilename());
          await download.saveAs(filePath);
          session.downloads.push({
            filename: download.suggestedFilename(),
            path: filePath,
            url: download.url()
          });
        } catch (err) {
          // ignore
        }
      });
    });

    sessions.set(applicationId, session);
    return session;
  } catch (error) {
    await logError('sessionRegistry.createSession', error.message);
    throw error;
  }
};

/**
 * Retrieves a browser session.
 */
export const getSession = (applicationId) => {
  const session = sessions.get(applicationId);
  if (session) {
    session.lastUsedAt = Date.now();
  }
  return session;
};

/**
 * Safely closes an active browser session.
 */
export const closeSession = async (applicationId) => {
  const session = sessions.get(applicationId);
  if (!session) return;

  try {
    for (const tab of session.tabs) {
      await tab.page.close().catch(() => {});
    }
    if (session.context) {
      await session.context.close().catch(() => {});
    }
    if (session.browser) {
      await session.browser.close().catch(() => {});
    }
  } catch (error) {
    await logError('sessionRegistry.closeSession', error.message);
  } finally {
    sessions.delete(applicationId);
  }
};

/**
 * Returns active tab's page or first page.
 */
export const getActivePage = (session) => {
  if (!session) return null;
  const tab = session.tabs.find(t => t.id === session.activeTabId);
  return tab ? tab.page : (session.tabs[0] ? session.tabs[0].page : null);
};

/**
 * Switches tab.
 */
export const switchTab = (session, tabId) => {
  if (!session) return null;
  const tab = session.tabs.find(t => t.id === tabId);
  if (tab) {
    session.activeTabId = tabId;
    return tab.page;
  }
  return null;
};

/**
 * Closes tab.
 */
export const closeTab = async (session, tabId) => {
  if (!session) return;
  const tabIndex = session.tabs.findIndex(t => t.id === tabId);
  if (tabIndex !== -1) {
    const tab = session.tabs[tabIndex];
    await tab.page.close().catch(() => {});
    session.tabs.splice(tabIndex, 1);
    if (session.activeTabId === tabId) {
      session.activeTabId = session.tabs[0] ? session.tabs[0].id : null;
    }
  }
};

/**
 * Saves and encrypts session state.
 */
export const saveSessionState = async (applicationId) => {
  const session = sessions.get(applicationId);
  if (!session || !session.context) return null;
  const rawState = await session.context.storageState().catch(() => null);
  if (!rawState) return null;
  return encryptValue(JSON.stringify(rawState));
};

// TTL cleanup timer
setInterval(async () => {
  const now = Date.now();
  for (const [appId, session] of sessions.entries()) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      await closeSession(appId).catch(() => {});
    }
  }
}, 60000);

// Graceful shutdown hooks
const shutdown = async () => {
  for (const appId of sessions.keys()) {
    await closeSession(appId).catch(() => {});
  }
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default {
  createSession,
  getSession,
  closeSession,
  getActivePage,
  switchTab,
  closeTab,
  saveSessionState,
  isSafeUrl,
  waitForSettled
};
