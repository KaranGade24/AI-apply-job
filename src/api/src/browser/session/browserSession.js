import { BrowserManager } from "../browserManager.js";
import { attachDialogHandler } from "./dialogHandler.js";

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
  }

  async start() {
    if (this.context) return this;

    const launched = await BrowserManager.launchWithSession(this.options);
    this.browser = launched.browser;
    this.context = launched.context;
    this.activePage = launched.page;
    this.pages = [launched.page];
    this.currentUrl = launched.page.url() || "";

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
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        this.currentUrl = page.url();
        this.lastUsedAt = new Date();
      }
    });
    page.on("close", () => {
      this.pages = this.pages.filter((candidate) => candidate !== page);
      if (this.activePage === page) {
        this.activePage =
          this.pages
            .slice()
            .reverse()
            .find((candidate) => !candidate.isClosed()) || null;
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
    else if (typeof target === "string")
      page =
        this.pages.find((candidate) => candidate.url().includes(target)) ||
        null;
    else if (target)
      page = this.pages.find((candidate) => candidate === target) || null;

    if (page && !page.isClosed()) {
      this.activePage = page;
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
  }
}

export default BrowserSession;
