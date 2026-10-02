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
  static humanResponseTimers = new Map();

  static clearHumanResponseTimer(applicationId) {
    const appId = String(applicationId);
    if (this.humanResponseTimers.has(appId)) {
      clearTimeout(this.humanResponseTimers.get(appId));
      this.humanResponseTimers.delete(appId);
      logJobEvent("sessionRegistry", "HUMAN_TIMER_CLEARED", `[application:${appId}] 3-minute inactivity timer cancelled.`).catch(() => {});
    }
  }

  static resetHumanResponseTimerIfActive(applicationId, userId) {
    const appId = String(applicationId);
    if (this.humanResponseTimers.has(appId)) {
      logJobEvent("sessionRegistry", "HUMAN_TIMER_RESET", `[application:${appId}] Page transition detected. Resetting 3-minute inactivity timer.`).catch(() => {});
      this.startHumanResponseTimer(appId, userId);
    }
  }

  static startHumanResponseTimer(applicationId, userId) {
    const appId = String(applicationId);
    this.clearHumanResponseTimer(appId);

    logJobEvent("sessionRegistry", "HUMAN_TIMER_STARTED", `[application:${appId}] 3-minute inactivity timer started.`).catch(() => {});

    const timeoutId = setTimeout(async () => {
      try {
        await logJobEvent(
          "sessionRegistry",
          "HUMAN_RESPONSE_TIMEOUT",
          `[application:${appId}] No response received within 3 minutes. Saving storage state and suspending browser session.`,
        );

        const session = activeSessions.get(appId);
        if (session && session.context) {
          const rawState = await session.context.storageState().catch(() => null);
          const currentUrl = session.currentUrl || (session.activePage && !session.activePage.isClosed() ? session.activePage.url() : "");

          const updateData = {};
          if (currentUrl) {
            updateData['workflow.agentState.pendingHumanAction.savedUrl'] = currentUrl;
          }
          if (rawState) {
            const stateToEncrypt = JSON.stringify(rawState);
            updateData['workflow.agentState.pendingHumanAction.savedStorageState'] = encryptValue(stateToEncrypt);
          }
          updateData['workflow.agentState.pendingHumanAction.reason'] = "Inactivity timeout reached (3 minutes exceeded)";
          updateData.updatedAt = new Date();

          await JobApplication.findByIdAndUpdate(appId, { $set: updateData }).catch(() => {});
        }

        await this.closeSession(appId).catch((err) => {
          logError("SessionRegistry.timeout.closeSession", err.message);
        });

        await ApplicationSessionRepository.updateSession(appId, userId, {
          notes: "Browser session suspended due to 3 minutes of user inactivity.",
        }).catch((err) => {
          logError("SessionRegistry.timeout.updateSession", err.message);
        });

      } catch (err) {
        logError("SessionRegistry.startHumanResponseTimer", err.message);
      } finally {
        this.humanResponseTimers.delete(appId);
      }
    }, 3 * 60 * 1000); // 3 minutes

    this.humanResponseTimers.set(appId, timeoutId);
  }

  static async createOrGetSession(applicationId, userId, options = {}) {
    const appId = String(applicationId);
    this.clearHumanResponseTimer(appId);
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
    this.clearHumanResponseTimer(appId);
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
