import { ApplicationSessionRepository } from "../../repositories/applicationSession.repository.js";
import { JobApplication } from "../../model/JobApplication.js";
import { SESSION_TTL_MS } from "../../constant/agent.constant.js";
import { logError, logJobEvent } from "../../utils/logger.js";
import { BrowserSession } from "./browserSession.js";
import { encryptValue } from "../../utils/encryption.js";

const activeSessions = new Map();
const MAX_SESSIONS_PER_USER = 3;
let ttlCleanupInterval = null;

/**
 * Validates URLs for safety.
 * Block private IPs, loopbacks, and non-http protocols.
 */
export const isSafeUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname === "::1"
    ) {
      return false;
    }
    // Block private IP ranges
    if (hostname.startsWith("10.")) return false;
    if (hostname.startsWith("192.168.")) return false;
    if (hostname.startsWith("172.")) {
      const parts = hostname.split(".");
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
      page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}),
      page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {})
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

export class SessionRegistry {
  static async createOrGetSession(applicationId, userId, options = {}) {
    const appId = String(applicationId);
    const existing = activeSessions.get(appId);
    if (existing) {
      existing.lastUsedAt = new Date();
      if (!existing.getActivePage()) await existing.start();
      return existing;
    }

    const session = await new BrowserSession(appId, userId, options).start();
    activeSessions.set(appId, session);
    this.ensureTtlCleanupStarted();
    await logJobEvent(
      "sessionRegistry",
      "SESSION_INITIALIZED",
      `[application:${appId}] Browser session initialized.`,
    );
    return session;
  }

  static getSession(applicationId) {
    const session = activeSessions.get(String(applicationId));
    if (session) session.lastUsedAt = new Date();
    return session || null;
  }

  static getActivePage(applicationId) {
    return this.getSession(applicationId)?.getActivePage() || null;
  }

  static async switchToPage(applicationId, target) {
    return this.getSession(applicationId)?.switchToPage(target) || null;
  }

  static async recreateSession(applicationId, userId, fallbackUrl = "") {
    const appId = String(applicationId);
    let targetUrl = fallbackUrl;
    if (!targetUrl) {
      const session =
        await ApplicationSessionRepository.findSessionByApplicationId(
          appId,
          userId,
        );
      targetUrl = session?.currentUrl || "";
    }
    if (!targetUrl) {
      const application = await JobApplication.findById(appId)
        .lean()
        .catch(() => null);
      targetUrl =
        application?.applyUrl || application?.pageAnalysis?.currentUrl || "";
    }

    await this.closeSession(appId);
    const session = await this.createOrGetSession(appId, userId);
    if (targetUrl)
      await session
        .goto(targetUrl, { waitUntil: "domcontentloaded" })
        .catch((error) =>
          logError("SessionRegistry.recreateSession.goto", error.message),
        );
    return session;
  }

  static async closeSession(applicationId) {
    const appId = String(applicationId);
    const session = activeSessions.get(appId);
    if (!session) return;
    activeSessions.delete(appId);
    await session
      .close()
      .catch((error) =>
        logError("SessionRegistry.closeSession", error.message),
      );
  }

  static async closeAllSessions() {
    await Promise.all(
      [...activeSessions.keys()].map((applicationId) =>
        this.closeSession(applicationId),
      ),
    );
  }

  static ensureTtlCleanupStarted() {
    if (ttlCleanupInterval) return;
    ttlCleanupInterval = setInterval(
      () => {
        const cutoff = Date.now() - SESSION_TTL_MS;
        for (const [applicationId, session] of activeSessions.entries()) {
          if (session.lastUsedAt.getTime() < cutoff)
            this.closeSession(applicationId).catch(() => {});
        }
      },
      Math.min(SESSION_TTL_MS, 60_000),
    );
    ttlCleanupInterval.unref?.();
  }

  static setupShutdownHooks(server) {
    const shutdownHook = () => this.closeAllSessions().catch(() => {});
    server?.on?.("close", shutdownHook);
    process.once("SIGINT", shutdownHook);
    process.once("SIGTERM", shutdownHook);
  }
}

// Functional exports
export const createSession = async (applicationId, ownerUserId, options = {}) => {
  // Enforce concurrency limit (max 3 sessions per user)
  const userSessions = Array.from(activeSessions.entries()).filter(([_, s]) => s.userId === ownerUserId);
  if (userSessions.length >= MAX_SESSIONS_PER_USER) {
    userSessions.sort((a, b) => a[1].createdAt - b[1].createdAt);
    const [oldestAppId, _] = userSessions[0];
    await SessionRegistry.closeSession(oldestAppId).catch(() => {});
  }

  return SessionRegistry.createOrGetSession(applicationId, ownerUserId, options);
};

export const getSession = (applicationId) => {
  return SessionRegistry.getSession(applicationId);
};

export const closeSession = async (applicationId) => {
  await SessionRegistry.closeSession(applicationId);
};

export const getActivePage = (session) => {
  if (!session) return null;
  if (typeof session === "string") {
    return SessionRegistry.getActivePage(session);
  }
  return session.getActivePage();
};

export const switchTab = async (session, tabId) => {
  if (!session) return null;
  return session.switchToPage(tabId);
};

export const closeTab = async (session, tabId) => {
  if (!session) return;
  const tabIndex = session.tabs.findIndex(t => t.id === tabId);
  if (tabIndex !== -1) {
    const tab = session.tabs[tabIndex];
    await tab.page.close().catch(() => {});
    session.tabs.splice(tabIndex, 1);
    session.pages = session.pages.filter(p => p !== tab.page);
    if (session.activeTabId === tabId) {
      session.activePage = session.pages[0] || null;
      const activeTab = session.tabs.find(t => t.page === session.activePage);
      session.activeTabId = activeTab ? activeTab.id : null;
    }
  }
};

export const saveSessionState = async (applicationId) => {
  const session = activeSessions.get(String(applicationId));
  if (!session || !session.context) return null;
  const rawState = await session.context.storageState().catch(() => null);
  if (!rawState) return null;
  return encryptValue(JSON.stringify(rawState));
};

export default {
  createSession,
  getSession,
  closeSession,
  getActivePage,
  switchTab,
  closeTab,
  saveSessionState,
  isSafeUrl,
  waitForSettled,
  SessionRegistry
};
