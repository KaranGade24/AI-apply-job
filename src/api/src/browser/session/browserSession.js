import path from "path";
import os from "os";
import fs from "fs";
import { BrowserManager } from "../browserManager.js";
import { attachDialogHandler } from "./dialogHandler.js";
import { logJobEvent } from "../../utils/logger.js";

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
  }

  async start() {
    if (this.context) return this;

    const launched = await BrowserManager.launchWithSession(this.options);
    this.browser = launched.browser;
    this.context = launched.context;
    this.activePage = launched.page;
    this.pages = [launched.page];
    this.currentUrl = launched.page.url() || "";

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
    attachDialogHandler(page, this.applicationId);

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

  async goto(url, options = {}) {
    const page = this.getActivePage();
    if (!page) throw new Error("Active browser page is unavailable.");
    await page.goto(url, options);
    this.currentUrl = page.url();
    this.lastUsedAt = new Date();
    return page;
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
