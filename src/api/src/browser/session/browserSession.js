import path from "path";
import os from "os";
import fs from "fs";
import { BrowserManager } from "../browserManager.js";
import { attachDialogHandler } from "./dialogHandler.js";
import { logJobEvent, logError } from "../../utils/logger.js";

export class BrowserSession {
  constructor(applicationId, userId, options = {}) {
    this.applicationId = String(applicationId);
    this.userId = String(userId || "");
    this.options = options;
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.pages = [];
    this.currentUrl = "";
    this.createdAt = new Date();
    this.lastUsedAt = new Date();

    // Functional API compatibility fields
    this.tabs = [];
    this.activeTabId = null;
    this.dialogs = [];
    this.downloads = [];
    this.redirectReports = [];
    this.ownerUserId = this.userId;

    // AI vs Human control switch
    this.controlMode = "AI"; // "AI" | "HUMAN"
    this.humanReason = null;
    this.humanMessage = null;
  }

  async start() {
    if (this.context) return this;

    const launched = await BrowserManager.launchWithSession(this.options);
    this.browser = launched.browser;
    this.context = launched.context;
    this.activePage = launched.page;
    this.pages = [launched.page];
    this.currentUrl = launched.page.url() || "";

    // Always inject Google session on start
    try {
      const { injectGoogleSessionIntoContext } = await import("../../services/googleSession.service.js");
      await injectGoogleSessionIntoContext(this.context, this.userId);
    } catch (err) {
      logError("browserSession.start.injectGoogle", err.message);
    }

    // Dynamic Naukri session injection if initial URL is Naukri
    const initialUrl = this.options.targetUrl || this.currentUrl;
    if (initialUrl) {
      await this.injectNaukriSessionIfRequired(initialUrl);
    }

    // Navigate to targetUrl immediately if provided
    if (this.options.targetUrl && this.options.targetUrl !== "about:blank") {
      try {
        await launched.page.goto(this.options.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        this.currentUrl = launched.page.url();
      } catch (gotoErr) {
        logError("browserSession.start.goto", gotoErr.message);
      }
    }

    // Dialog handling for functional compatibility
    this.context.on("dialog", async (dialog) => {
      this.dialogs.push({
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
        timestamp: Date.now()
      });

      if (dialog.type() === "confirm") {
        await dialog.dismiss().catch(() => {});
      } else {
        await dialog.accept().catch(() => {});
      }
    });

    this.context.on("page", (page) => {
      if (!this.pages.includes(page)) this.pages.push(page);
      this.activePage = page;
      this.lastUsedAt = new Date();
      this.attachPage(page);
    });

    this.attachPage(launched.page);
    return this;
  }

  attachPage(page) {
    page.bringToFront().catch(() => {});
    attachDialogHandler(page, this.applicationId);

    // Auto-attach live screencast for real-time remote browser viewing & interaction
    import("./browserStreamService.js")
      .then((m) => m.attachScreencast(this.applicationId, page))
      .catch(() => {});

    // Sync tabs array for functional compatibility
    const existingTab = this.tabs.find(t => t.page === page);
    let tabId;
    if (!existingTab) {
      tabId = "tab_" + Math.random().toString(36).substring(2, 11);
      const tabObj = {
        id: tabId,
        page: page,
        url: page.url(),
        title: "Untitled",
        domain: ""
      };
      try {
        tabObj.domain = new URL(tabObj.url).hostname;
      } catch {
        // ignore
      }
      this.tabs.push(tabObj);
      this.activeTabId = tabId;
    } else {
      tabId = existingTab.id;
    }

    page.on("framenavigated", async (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = page.url();
        this.currentUrl = newUrl;
        this.lastUsedAt = new Date();

        // Dynamically inject Naukri session if navigating to a Naukri URL
        if (newUrl && newUrl.toLowerCase().includes("naukri.com")) {
          await this.injectNaukriSessionIfRequired(newUrl);
        }

        // If the page navigates to Naukri's saveCompanyApply API page (blank response),
        // mark application as applied and switch stream to external career site tab if one was opened.
        if (newUrl && newUrl.toLowerCase().includes("savecompanyapply")) {
          setTimeout(async () => {
            try {
              if (page.isClosed()) return;

              // Ensure the page is still on the saveCompanyApply page before doing anything
              const currentUrl = page.url() || "";
              if (!currentUrl.toLowerCase().includes("savecompanyapply")) return;

              try {
                const { JobApplication } = await import("../../model/JobApplication.js");
                await JobApplication.findByIdAndUpdate(this.applicationId, {
                  status: "applied",
                  "form.submittedAt": new Date(),
                }).catch(() => {});

                const { broadcastToApp } = await import("./browserStreamService.js");
                broadcastToApp(this.applicationId, {
                  type: "VERIFICATION_COMPLETED",
                  status: "applied",
                  timestamp: Date.now(),
                });
              } catch (err) {
                // ignore
              }

              const otherPage = this.pages.find((p) => {
                const u = p.url() || "";
                return p !== page && !p.isClosed() && !u.includes("naukri.com") && !u.includes("about:blank") && u !== "";
              });
              if (otherPage) {
                this.activePage = otherPage;
                const otherTab = this.tabs.find((t) => t.page === otherPage);
                if (otherTab) {
                  this.activeTabId = otherTab.id;
                }
                await page.close().catch(() => {});
              } else {
                // No other tabs (Direct apply completed). Inject a beautiful success screen into the blank page
                const successHtml = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Application Submitted Successfully</title>
                    <style>
                      body {
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        background-color: #0b0f19;
                        color: #e2e8f0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        text-align: center;
                      }
                      .container {
                        max-width: 480px;
                        padding: 40px;
                        background-color: #111827;
                        border: 1px solid #1f2937;
                        border-radius: 20px;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
                      }
                      .icon-container {
                        width: 80px;
                        height: 80px;
                        background-color: rgba(16, 185, 129, 0.1);
                        border: 2px solid rgba(16, 185, 129, 0.2);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #10b981;
                        margin: 0 auto 24px auto;
                        font-size: 38px;
                        font-weight: bold;
                      }
                      .badge {
                        display: inline-block;
                        padding: 6px 14px;
                        background-color: rgba(59, 130, 246, 0.1);
                        border: 1px solid rgba(59, 130, 246, 0.2);
                        color: #60a5fa;
                        font-size: 11px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        border-radius: 9999px;
                        margin-bottom: 20px;
                      }
                      h1 {
                        font-size: 24px;
                        font-weight: 800;
                        margin: 0 0 12px 0;
                        color: #ffffff;
                        letter-spacing: -0.025em;
                      }
                      p {
                        font-size: 14px;
                        line-height: 1.6;
                        color: #9ca3af;
                        margin: 0;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="icon-container">✓</div>
                      <div class="badge">Naukri Direct Apply</div>
                      <h1>Applied Successfully!</h1>
                      <p>Your application was successfully processed and submitted directly to the employer on Naukri. You can safely close this live browser view now.</p>
                    </div>
                  </body>
                  </html>
                `;
                await page.setContent(successHtml).catch(() => {});
              }
            } catch (err) {
              // ignore
            }
          }, 1800);
        }

        try {
          const { SessionRegistry } = await import("./sessionRegistry.js");
          SessionRegistry.resetHumanResponseTimerIfActive(this.applicationId, this.userId);
        } catch (timerErr) {
          // non-blocking
        }

        const tab = this.tabs.find(t => t.page === page);
        if (tab) {
          const oldDomain = tab.domain;
          let newDomain = "";
          try {
            newDomain = new URL(newUrl).hostname;
          } catch {
            // ignore
          }
          tab.url = newUrl;
          tab.title = await page.title().catch(() => "") || "Untitled";
          tab.domain = newDomain;

          if (oldDomain && newDomain && oldDomain !== newDomain) {
            this.redirectReports.push({
              tabId: tab.id,
              fromDomain: oldDomain,
              toDomain: newDomain,
              url: newUrl,
              timestamp: Date.now()
            });
            await logJobEvent("tabTracking", "DOMAIN_REDIRECT", `Tab ${tab.id} redirected from ${oldDomain} to ${newDomain}`).catch(() => {});
          }
        }
      }
    });

    page.on("download", async (download) => {
      try {
        const tempDir = path.join(os.tmpdir(), "ai-apply-downloads");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const filePath = path.join(tempDir, download.suggestedFilename());
        await download.saveAs(filePath);
        this.downloads.push({
          filename: download.suggestedFilename(),
          path: filePath,
          url: download.url()
        });
      } catch (err) {
        // ignore
      }
    });

    page.on("close", () => {
      this.pages = this.pages.filter((candidate) => candidate !== page);
      this.tabs = this.tabs.filter(t => t.page !== page);
      if (this.activePage === page) {
        this.activePage =
          this.pages
            .slice()
            .reverse()
            .find((candidate) => !candidate.isClosed()) || null;

        const activeTab = this.tabs.find(t => t.page === this.activePage);
        this.activeTabId = activeTab ? activeTab.id : null;
      }
      this.lastUsedAt = new Date();
    });
  }

  getActivePage() {
    this.lastUsedAt = new Date();
    if (this.activePage && !this.activePage.isClosed()) return this.activePage;
    this.activePage =
      this.pages
        .slice()
        .reverse()
        .find((page) => !page.isClosed()) || null;
    return this.activePage;
  }

  async switchToPage(target) {
    let page = null;
    if (typeof target === "number") page = this.pages[target] || null;
    else if (typeof target === "function")
      page = this.pages.find(target) || null;
    else if (typeof target === "string") {
      // Could be tab ID or url fragment
      const foundTab = this.tabs.find(t => t.id === target);
      if (foundTab) {
        page = foundTab.page;
      } else {
        page = this.pages.find((candidate) => candidate.url().includes(target)) || null;
      }
    } else if (target)
      page = this.pages.find((candidate) => candidate === target) || null;

    if (page && !page.isClosed()) {
      this.activePage = page;
      const foundTab = this.tabs.find(t => t.page === page);
      if (foundTab) {
        this.activeTabId = foundTab.id;
      }
      this.lastUsedAt = new Date();
      await page.bringToFront().catch(() => {});
    }
    return this.getActivePage();
  }

  async getUrl() {
    const page = this.getActivePage();
    return page ? page.url() : this.currentUrl;
  }

  async getTitle() {
    const page = this.getActivePage();
    if (!page) return "";
    return await page.title().catch(() => "");
  }

  async goto(url, options = {}) {
    return this.navigate(url, options);
  }

  async injectNaukriSessionIfRequired(url) {
    if (!url) return;
    try {
      const isNaukri = url.toLowerCase().includes("naukri.com");
      if (isNaukri) {
        const { getDecryptedSessionForUser } = await import("../../services/naukriSession.service.js");
        const sessionState = await getDecryptedSessionForUser(this.userId);
        if (sessionState && Array.isArray(sessionState.cookies)) {
          const validCookies = sessionState.cookies
            .filter((c) => c && c.name && c.value)
            .map((c) => {
              const cookie = {
                name: c.name,
                value: c.value,
                path: c.path || "/",
              };
              if (c.domain) {
                cookie.domain = c.domain;
              } else {
                cookie.domain = ".naukri.com";
              }
              if (c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None") {
                cookie.sameSite = c.sameSite;
              }
              cookie.secure = c.secure !== false;
              if (c.httpOnly !== undefined) {
                cookie.httpOnly = Boolean(c.httpOnly);
              }
              if (typeof c.expires === "number" && c.expires > 0) {
                cookie.expires = Math.round(c.expires);
              }
              return cookie;
            });

          if (validCookies.length > 0) {
            await this.context.addCookies(validCookies).catch(() => {});
            await logJobEvent(
              "browserSession",
              "NAUKRI_SESSION_INJECTED",
              `Successfully injected ${validCookies.length} Naukri session cookies for User: ${this.userId}`
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      logError("browserSession.injectNaukriSession", err.message);
    }
  }

  async navigate(url, options = {}) {
    let page = this.getActivePage();
    if (!page) {
      await this.recoverSession();
      page = this.getActivePage();
    }
    if (!page) throw new Error("Active browser page is unavailable.");

    // Inject Naukri cookies dynamically if URL contains naukri.com
    await this.injectNaukriSessionIfRequired(url);

    const waitUntil = options.waitUntil || "domcontentloaded";
    const timeout = options.timeout || 30000;

    try {
      await page.goto(url, { waitUntil, timeout });
    } catch (navErr) {
      // Fallback: If network idle timed out, domcontentloaded may still be healthy
      if (waitUntil !== "commit") {
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      }
    }

    this.currentUrl = page.url();
    this.lastUsedAt = new Date();
    return page;
  }

  async openNewTab(url = "about:blank") {
    if (!this.context) await this.start();

    // Inject Naukri cookies dynamically if URL contains naukri.com
    await this.injectNaukriSessionIfRequired(url);

    const newPage = await this.context.newPage();
    this.attachPage(newPage);
    if (url && url !== "about:blank") {
      await newPage.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    this.activePage = newPage;
    return newPage;
  }

  async closeTab(tabId) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab && tab.page && !tab.page.isClosed()) {
      await tab.page.close().catch(() => {});
    }
    return this.getActivePage();
  }

  async detectIframes() {
    const page = this.getActivePage();
    if (!page || page.isClosed()) return [];

    try {
      const frames = page.frames();
      return frames.map((frame, index) => {
        const frameUrl = frame.url() || "";
        const frameName = frame.name() || `frame_${index}`;
        const isCaptcha = /captcha|recaptcha|hcaptcha|turnstile|challenge/i.test(frameUrl);
        const isGoogleForm = /docs\.google\.com\/forms|forms\.gle/i.test(frameUrl);
        const isWorkday = /myworkdayjobs|workday/i.test(frameUrl);

        return {
          index,
          name: frameName,
          url: frameUrl,
          isMainFrame: frame === page.mainFrame(),
          isCaptcha,
          isGoogleForm,
          isWorkday,
        };
      });
    } catch (err) {
      return [];
    }
  }

  async captureScreenshot(options = {}) {
    const page = this.getActivePage();
    if (!page || page.isClosed()) return null;

    const {
      fullPage = false,
      elementSelector = null,
      encoding = "base64",
    } = options;

    try {
      if (elementSelector) {
        const el = page.locator(elementSelector).first();
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          const buffer = await el.screenshot();
          return encoding === "base64" ? buffer.toString("base64") : buffer;
        }
      }

      const buffer = await page.screenshot({ fullPage });
      return encoding === "base64" ? buffer.toString("base64") : buffer;
    } catch (err) {
      await logJobEvent(
        "browserSession",
        "SCREENSHOT_ERROR",
        `Screenshot failed for ${this.applicationId}: ${err.message}`
      ).catch(() => {});
      return null;
    }
  }

  async saveCookies(customPath = null) {
    if (!this.context) return null;
    try {
      const storage = await this.context.storageState();
      if (customPath) {
        fs.writeFileSync(customPath, JSON.stringify(storage, null, 2), "utf8");
      }
      return storage;
    } catch (err) {
      return null;
    }
  }

  async restoreCookies(storageDataOrPath) {
    if (!this.context) await this.start();
    try {
      let state = storageDataOrPath;
      if (typeof storageDataOrPath === "string") {
        if (fs.existsSync(storageDataOrPath)) {
          state = JSON.parse(fs.readFileSync(storageDataOrPath, "utf8"));
        }
      }
      if (state && Array.isArray(state.cookies)) {
        await this.context.addCookies(state.cookies);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  async recoverSession() {
    await logJobEvent(
      "browserSession",
      "RECOVER_SESSION",
      `Attempting session recovery for application ${this.applicationId}`
    ).catch(() => {});

    try {
      if (!this.browser || !this.browser.isConnected()) {
        await this.close().catch(() => {});
        await this.start();
        return this.getActivePage();
      }

      if (!this.context) {
        const launched = await BrowserManager.launchWithSession(this.options);
        this.context = launched.context;
        this.activePage = launched.page;
        this.pages = [launched.page];
        this.attachPage(launched.page);
        return this.activePage;
      }

      // Check if any page is still alive
      const alivePage = this.pages.find((p) => !p.isClosed());
      if (alivePage) {
        this.activePage = alivePage;
        return alivePage;
      }

      // Create new page inside existing context
      const newPage = await this.context.newPage();
      this.attachPage(newPage);
      this.activePage = newPage;
      return newPage;
    } catch (err) {
      await logJobEvent(
        "browserSession",
        "RECOVERY_FAILED",
        `Session recovery failed: ${err.message}. Relaunching clean session...`
      ).catch(() => {});

      await this.close().catch(() => {});
      await this.start();
      return this.getActivePage();
    }
  }

  async cleanup() {
    return this.close();
  }

  async close() {
    await BrowserManager.closeSafely({
      context: this.context,
      browser: this.browser,
    });
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.pages = [];
    this.tabs = [];
    this.activeTabId = null;
  }
}

export default BrowserSession;
