import { SessionRegistry } from "./sessionRegistry.js";
import { logJobEvent, logError } from "../../utils/logger.js";
import {
  CONTROL_MODES,
  HUMAN_INTERVENTION_REASONS,
  REALTIME_EVENTS,
  AGENT_STATUS,
} from "../../constant/agent.constant.js";
import { classifyPage } from "../../agent/browser/perception/classifyPage.js";

// Map of applicationId -> Set of WebSocket clients
const clientSubscribers = new Map();

// Map of applicationId -> StreamState { cdpSession, latestFrame, activePage, isScreencasting }
const streamStates = new Map();

/**
 * Initializes or retrieves the streaming state for an application.
 *
 * @param {string} applicationId
 * @returns {object}
 */
const getOrCreateStreamState = (applicationId) => {
  const appIdStr = String(applicationId);
  if (!streamStates.has(appIdStr)) {
    streamStates.set(appIdStr, {
      cdpSession: null,
      latestFrame: null,
      currentUrl: "",
      pageTitle: "",
      activePage: null,
      isScreencasting: false,
      lastInteractionAt: Date.now(),
    });
  }
  return streamStates.get(appIdStr);
};

/**
 * Broadcasts a JSON message to all subscribed WebSocket clients for an application.
 *
 * @param {string} applicationId
 * @param {object} payload
 */
export const broadcastToApp = (applicationId, payload) => {
  const appIdStr = String(applicationId);
  const clients = clientSubscribers.get(appIdStr);
  if (!clients || clients.size === 0) return;

  const serialized = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(serialized);
      } catch (err) {
        logError("browserStreamService.broadcast", err.message);
      }
    }
  }
};

/**
 * Attaches Chrome DevTools Protocol screencast to the active Playwright page of a session.
 *
 * @param {string} applicationId
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
export const attachScreencast = async (applicationId, page) => {
  const appIdStr = String(applicationId);
  const streamState = getOrCreateStreamState(appIdStr);

  if (!page || page.isClosed()) {
    return false;
  }

  // If already attached to this exact page and screencasting
  if (streamState.activePage === page && streamState.cdpSession && streamState.isScreencasting) {
    return true;
  }

  // Clean up previous CDP session if target changed
  if (streamState.cdpSession) {
    try {
      await streamState.cdpSession.detach().catch(() => {});
    } catch {}
    streamState.cdpSession = null;
    streamState.isScreencasting = false;
  }

  streamState.activePage = page;
  streamState.currentUrl = page.url() || "";
  try {
    streamState.pageTitle = await page.title().catch(() => "");
  } catch {}

  try {
    const context = page.context();
    const cdp = await context.newCDPSession(page);
    streamState.cdpSession = cdp;

    cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId });
      } catch {}

      streamState.latestFrame = data;
      streamState.currentUrl = page.url();

      broadcastToApp(appIdStr, {
        type: "FRAME",
        data,
        metadata,
        currentUrl: streamState.currentUrl,
        timestamp: Date.now(),
      });
    });

    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 75,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });

    streamState.isScreencasting = true;

    // Listen for navigation changes
    page.on("framenavigated", async (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = page.url();
        streamState.currentUrl = newUrl;
        const newTitle = await page.title().catch(() => "");
        streamState.pageTitle = newTitle;

        broadcastToApp(appIdStr, {
          type: REALTIME_EVENTS.PAGE_CHANGED,
          url: newUrl,
          title: newTitle,
          timestamp: Date.now(),
        });
      }
    });

    await logJobEvent(
      "browserStreamService",
      "SCREENCAST_ATTACHED",
      `[application:${appIdStr}] Live screencast attached to active page`,
    );

    return true;
  } catch (error) {
    await logError("browserStreamService.attachScreencast", error.message);
    // Fallback: simple screenshot poll if CDP fails
    startScreenshotFallback(appIdStr, page);
    return false;
  }
};

/**
 * Fallback screencast loop using standard Playwright screenshot if CDP screencast is unavailable.
 */
let fallbackIntervals = new Map();
const startScreenshotFallback = (applicationId, page) => {
  const appIdStr = String(applicationId);
  if (fallbackIntervals.has(appIdStr)) return;

  const interval = setInterval(async () => {
    if (!page || page.isClosed()) {
      clearInterval(interval);
      fallbackIntervals.delete(appIdStr);
      return;
    }
    const clients = clientSubscribers.get(appIdStr);
    if (!clients || clients.size === 0) return;

    try {
      const buffer = await page.screenshot({ type: "jpeg", quality: 65, timeout: 2000 });
      const base64 = buffer.toString("base64");
      const streamState = getOrCreateStreamState(appIdStr);
      streamState.latestFrame = base64;
      streamState.currentUrl = page.url();

      broadcastToApp(appIdStr, {
        type: "FRAME",
        data: base64,
        currentUrl: streamState.currentUrl,
        timestamp: Date.now(),
      });
    } catch {}
  }, 250);

  fallbackIntervals.set(appIdStr, interval);
};

/**
 * Dispatches remote user input interactions directly into the live Playwright browser page.
 *
 * @param {string} applicationId
 * @param {object} action - Remote user action descriptor
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export const dispatchBrowserAction = async (applicationId, action = {}) => {
  const appIdStr = String(applicationId);
  const session = SessionRegistry.getSession(appIdStr);
  const page = session?.getActivePage();

  if (!page || page.isClosed()) {
    return { success: false, message: "Browser page is not active or has closed" };
  }

  const streamState = getOrCreateStreamState(appIdStr);
  streamState.lastInteractionAt = Date.now();

  try {
    switch (action.type) {
      case "mouseMove":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.move(action.x, action.y);
        }
        break;

      case "mouseDown":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.move(action.x, action.y);
        }
        await page.mouse.down({ button: action.button || "left" });
        break;

      case "mouseUp":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.move(action.x, action.y);
        }
        await page.mouse.up({ button: action.button || "left" });
        break;

      case "click":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.click(action.x, action.y, {
            button: action.button || "left",
            clickCount: action.clickCount || 1,
            delay: action.delay || 50,
          });
        }
        break;

      case "dblclick":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.dblclick(action.x, action.y, {
            button: action.button || "left",
          });
        }
        break;

      case "wheel":
      case "scroll":
        if (typeof action.x === "number" && typeof action.y === "number") {
          await page.mouse.move(action.x, action.y);
        }
        await page.mouse.wheel(action.deltaX || 0, action.deltaY || 0);
        break;

      case "keyDown":
        if (action.key) {
          await page.keyboard.down(action.key);
        }
        break;

      case "keyUp":
        if (action.key) {
          await page.keyboard.up(action.key);
        }
        break;

      case "type":
        if (typeof action.text === "string") {
          await page.keyboard.type(action.text, { delay: 10 });
        }
        break;

      case "press":
        if (action.key) {
          await page.keyboard.press(action.key);
        }
        break;

      case "navigate":
        if (action.url) {
          await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 25000 });
        }
        break;

      case "reload":
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
        break;

      case "goBack":
        await page.goBack().catch(() => {});
        break;

      case "goForward":
        await page.goForward().catch(() => {});
        break;

      case "selectOption":
        if (action.selector && action.value) {
          await page.selectOption(action.selector, action.value);
        }
        break;

      case "setCheckbox":
        if (action.selector) {
          if (action.checked) {
            await page.check(action.selector);
          } else {
            await page.uncheck(action.selector);
          }
        }
        break;

      default:
        return { success: false, message: `Unknown action type: ${action.type}` };
    }

    return { success: true };
  } catch (error) {
    await logError("browserStreamService.dispatchAction", error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Retrieves the latest screencast frame (base64 JPEG) and browser metadata for an application.
 *
 * @param {string} applicationId
 * @returns {object}
 */
export const getLatestBrowserFrame = (applicationId) => {
  const appIdStr = String(applicationId);
  const streamState = getOrCreateStreamState(appIdStr);
  const session = SessionRegistry.getSession(appIdStr);
  const page = session?.getActivePage();

  return {
    applicationId: appIdStr,
    frame: streamState.latestFrame,
    currentUrl: page?.url() || streamState.currentUrl || "",
    pageTitle: streamState.pageTitle || "",
    isLive: Boolean(page && !page.isClosed()),
    controlMode: session?.controlMode || CONTROL_MODES.AI,
    humanReason: session?.humanReason || null,
    humanMessage: session?.humanMessage || null,
    timestamp: Date.now(),
  };
};

/**
 * Subscribes a WebSocket client to an application's browser stream.
 *
 * @param {string} applicationId
 * @param {WebSocket} ws
 */
export const subscribeClient = async (applicationId, ws) => {
  const appIdStr = String(applicationId);
  if (!clientSubscribers.has(appIdStr)) {
    clientSubscribers.set(appIdStr, new Set());
  }
  const clients = clientSubscribers.get(appIdStr);
  clients.add(ws);

  const session = SessionRegistry.getSession(appIdStr);
  const page = session?.getActivePage();

  // Send initial connected metadata & latest frame immediately
  const streamState = getOrCreateStreamState(appIdStr);
  ws.send(
    JSON.stringify({
      type: REALTIME_EVENTS.BROWSER_STARTED,
      applicationId: appIdStr,
      currentUrl: page?.url() || streamState.currentUrl || "",
      isLive: Boolean(page && !page.isClosed()),
      controlMode: session?.controlMode || CONTROL_MODES.AI,
      humanReason: session?.humanReason || null,
      humanMessage: session?.humanMessage || null,
      data: streamState.latestFrame,
      timestamp: Date.now(),
    }),
  );

  // If page is active, ensure screencast is attached
  if (page && !page.isClosed()) {
    await attachScreencast(appIdStr, page);
  }

  ws.on("message", async (rawMessage) => {
    try {
      const parsed = JSON.parse(rawMessage.toString());
      if (parsed.type === "ACTION" && parsed.action) {
        await dispatchBrowserAction(appIdStr, parsed.action);
      } else if (parsed.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
      }
    } catch (err) {
      logError("browserStreamService.wsMessage", err.message);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    if (clients.size === 0) {
      clientSubscribers.delete(appIdStr);
    }
  });
};

/**
 * Checks whether an active human challenge on the live page has been solved.
 *
 * @param {string} applicationId
 * @returns {Promise<{ resolved: boolean, pageType: string, reason?: string, currentUrl: string }>}
 */
export const checkHumanChallengeResolved = async (applicationId) => {
  const appIdStr = String(applicationId);
  const session = SessionRegistry.getSession(appIdStr);
  const page = session?.getActivePage();

  if (!page || page.isClosed()) {
    return {
      resolved: false,
      pageType: "UNKNOWN",
      reason: "Browser page is closed or unavailable",
      currentUrl: "",
    };
  }

  const currentUrl = page.url();
  const title = await page.title().catch(() => "");
  const visibleText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 1500) || "")
    .catch(() => "");

  // Observe page state deterministically
  const observation = {
    url: currentUrl,
    title,
    visibleTextTrimmed: visibleText,
    elements: [],
  };

  const classification = await classifyPage(observation);
  const { pageType } = classification;

  // If page is still CAPTCHA or blocked
  if (pageType === "CAPTCHA_OR_BLOCKED") {
    return {
      resolved: false,
      pageType,
      reason: "CAPTCHA challenge is still detected on the page.",
      currentUrl,
    };
  }

  // If login is still blocking with password input visible
  const hasPasswordInput = await page.$('input[type="password"]').catch(() => null);
  if (pageType === "LOGIN" && hasPasswordInput) {
    return {
      resolved: false,
      pageType,
      reason: "Login credentials challenge is still present.",
      currentUrl,
    };
  }

  // If redirected away from captcha/login to an application form, review, or success
  return {
    resolved: true,
    pageType,
    currentUrl,
    message: "Human challenge resolved successfully. Browser is ready for AI automation.",
  };
};

export default {
  broadcastToApp,
  attachScreencast,
  dispatchBrowserAction,
  getLatestBrowserFrame,
  subscribeClient,
  checkHumanChallengeResolved,
};
