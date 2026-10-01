import { ApplicationSessionRepository } from "../../repositories/applicationSession.repository.js";
import { JobApplication } from "../../model/JobApplication.js";
import { SESSION_TTL_MS } from "../../constant/agent.constant.js";
import { logError, logJobEvent } from "../../utils/logger.js";
import { BrowserSession } from "./browserSession.js";

const activeSessions = new Map();
let ttlCleanupInterval = null;

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
    const shutdown = () => this.closeAllSessions().catch(() => {});
    server?.on?.("close", shutdown);
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
}

export default SessionRegistry;
