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
      heldMouseButtons: new Set(),
      heldKeys: new Set(),
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

  // Clear any existing screenshot fallback interval
  if (fallbackIntervals.has(appIdStr)) {
    clearInterval(fallbackIntervals.get(appIdStr));
    fallbackIntervals.delete(appIdStr);
  }

  streamState.activePage = page;
  streamState.currentUrl = page.url() || "";
  try {
    streamState.pageTitle = await page.title().catch(() => "");
  } catch {}

  try {
    const context = typeof page.context === "function" ? page.context() : page.context;
    if (!context || typeof context.newCDPSession !== "function") {
      startScreenshotFallback(appIdStr, page);
      return true;
    }

    // Resilient CDP Attachment with retry for extremely fresh pages/popups
    let cdp = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        cdp = await context.newCDPSession(page);
        break;
      } catch (cdpErr) {
        attempts++;
        if (attempts >= 3) {
          throw cdpErr;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

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

    // Capture initial screenshot immediately in background to avoid any initial blank or frozen screens
    page.screenshot({ type: "jpeg", quality: 65, timeout: 3000 })
      .then((buffer) => {
        if (streamState.activePage === page) {
          const base64 = buffer.toString("base64");
          streamState.latestFrame = base64;
          broadcastToApp(appIdStr, {
            type: "FRAME",
            data: base64,
            currentUrl: page.url(),
            timestamp: Date.now(),
          });
        }
      })
      .catch(() => {});

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

        // Capture a fresh screenshot on navigation to update the frame immediately
        setTimeout(() => {
          if (page.isClosed()) return;
          page.screenshot({ type: "jpeg", quality: 65, timeout: 3000 })
            .then((buffer) => {
              if (streamState.activePage === page) {
                const base64 = buffer.toString("base64");
                streamState.latestFrame = base64;
                broadcastToApp(appIdStr, {
                  type: "FRAME",
                  data: base64,
                  currentUrl: newUrl,
                  timestamp: Date.now(),
                });
              }
            })
            .catch(() => {});
        }, 300);
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
  if (fallbackIntervals.has(appIdStr)) {
    clearInterval(fallbackIntervals.get(appIdStr));
    fallbackIntervals.delete(appIdStr);
  }

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
 * Safely releases any held mouse buttons or modifier keys for an application.
 *
 * @param {string} applicationId
 */
export const releaseHeldInputs = async (applicationId) => {
  const appIdStr = String(applicationId);
  const streamState = streamStates.get(appIdStr);
  const page = SessionRegistry.getActivePage(appIdStr);

  if (streamState && page && !page.isClosed()) {
    try {
      if (streamState.heldMouseButtons && streamState.heldMouseButtons.size > 0) {
        for (const button of streamState.heldMouseButtons) {
          await page.mouse.up({ button }).catch(() => {});
        }
        streamState.heldMouseButtons.clear();
      }
      if (streamState.heldKeys && streamState.heldKeys.size > 0) {
        for (const key of streamState.heldKeys) {
          await page.keyboard.up(key).catch(() => {});
        }
        streamState.heldKeys.clear();
      }
    } catch (err) {
      logError("browserStreamService.releaseHeldInputs", err.message);
    }
  }
};

/**
 * Cleans up streaming state and detached CDP session when application session is closed.
 *
 * @param {string} applicationId
 */
export const cleanupStreamState = async (applicationId) => {
  const appIdStr = String(applicationId);
  await releaseHeldInputs(appIdStr).catch(() => {});

  if (fallbackIntervals.has(appIdStr)) {
    clearInterval(fallbackIntervals.get(appIdStr));
    fallbackIntervals.delete(appIdStr);
  }

  const streamState = streamStates.get(appIdStr);
  if (streamState?.cdpSession) {
    try {
      await streamState.cdpSession.detach().catch(() => {});
    } catch {}
  }
  streamStates.delete(appIdStr);
};

/**
 * Dispatches remote user input interactions directly into the live Playwright browser page.
 *
 * @param {string} applicationId
 * @param {object} action - Remote user action descriptor
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export const dispatchBrowserAction = async (applicationId, action = {}) => {
  if (!applicationId || typeof applicationId !== "string") {
    return { success: false, message: "Invalid applicationId" };
  }

  const appIdStr = String(applicationId);
  const session = SessionRegistry.getSession(appIdStr);
  const page = SessionRegistry.getActivePage(appIdStr);

  if (!page || page.isClosed()) {
    return { success: false, message: "Browser page is not active or has closed" };
  }

  const streamState = getOrCreateStreamState(appIdStr);
  streamState.lastInteractionAt = Date.now();

  const isHumanActive =
    session.controlMode === CONTROL_MODES.HUMAN ||
    Boolean(session.humanReason) ||
    session.status === AGENT_STATUS.WAITING_FOR_HUMAN ||
    session.status === AGENT_STATUS.WAITING_FOR_USER;

  const directInputTypes = new Set([
    "mouseMove",
    "mouseDown",
    "mouseUp",
    "click",
    "dblclick",
    "wheel",
    "scroll",
    "keyDown",
    "keyUp",
    "press",
    "type",
    "insertText",
  ]);

  if (directInputTypes.has(action.type) && !isHumanActive) {
    return {
      success: false,
      message: "Direct user input ignored: browser is in AI Autonomous mode. Click 'Take Control' first.",
    };
  }

  const sanitizeCoord = (val, max = 2560) => {
    if (typeof val !== "number" || Number.isNaN(val)) return null;
    return Math.max(0, Math.min(max, Math.round(val)));
  };

  const allowedButtons = new Set(["left", "middle", "right"]);
  const button = allowedButtons.has(action.button) ? action.button : "left";

  try {
    switch (action.type) {
      case "mouseMove": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.move(x, y);
        }
        break;
      }

      case "mouseDown": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.move(x, y);
        }
        await page.mouse.down({ button });
        streamState.heldMouseButtons.add(button);
        break;
      }

      case "mouseUp": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.move(x, y);
        }
        await page.mouse.up({ button });
        streamState.heldMouseButtons.delete(button);
        break;
      }

      case "click": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.click(x, y, {
            button,
            clickCount: Math.min(3, Math.max(1, action.clickCount || 1)),
            delay: Math.min(500, Math.max(0, action.delay || 50)),
          });
        }
        break;
      }

      case "dblclick": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.dblclick(x, y, { button });
        }
        break;
      }

      case "wheel":
      case "scroll": {
        const x = sanitizeCoord(action.x, 2560);
        const y = sanitizeCoord(action.y, 1600);
        if (x !== null && y !== null) {
          await page.mouse.move(x, y);
        }
        const deltaX = typeof action.deltaX === "number" ? Math.max(-1000, Math.min(1000, Math.round(action.deltaX))) : 0;
        const deltaY = typeof action.deltaY === "number" ? Math.max(-1000, Math.min(1000, Math.round(action.deltaY))) : 0;
        await page.mouse.wheel(deltaX, deltaY);
        break;
      }

      case "keyDown": {
        if (typeof action.key === "string" && action.key && action.key.length <= 50) {
          await page.keyboard.down(action.key);
          streamState.heldKeys.add(action.key);
        }
        break;
      }

      case "keyUp": {
        if (typeof action.key === "string" && action.key && action.key.length <= 50) {
          await page.keyboard.up(action.key);
          streamState.heldKeys.delete(action.key);
        }
        break;
      }

      case "press": {
        if (typeof action.key === "string" && action.key && action.key.length <= 50) {
          await page.keyboard.press(action.key, {
            delay: Math.min(500, Math.max(0, action.delay || 20)),
          });
        }
        break;
      }

      case "type": {
        if (typeof action.text === "string" && action.text) {
          await page.keyboard.type(action.text.slice(0, 5000), { delay: Math.min(200, Math.max(0, action.delay || 10)) });
        }
        break;
      }

      case "insertText": {
        if (typeof action.text === "string" && action.text) {
          await page.keyboard.insertText(action.text.slice(0, 5000));
        }
        break;
      }

      case "resetInput": {
        await releaseHeldInputs(appIdStr);
        break;
      }

      case "navigate": {
        if (action.url && typeof action.url === "string") {
          await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 25000 });
        }
        break;
      }

      case "reload": {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
        break;
      }

      case "goBack": {
        await page.goBack().catch(() => {});
        break;
      }

      case "goForward": {
        await page.goForward().catch(() => {});
        break;
      }

      case "selectOption": {
        if (action.selector && action.value) {
          await page.selectOption(action.selector, action.value);
        }
        break;
      }

      case "setCheckbox": {
        if (action.selector) {
          if (action.checked) {
            await page.check(action.selector);
          } else {
            await page.uncheck(action.selector);
          }
        }
        break;
      }

      default:
        return { success: false, message: `Unknown action type: ${action.type}` };
    }

    return { success: true };
  } catch (error) {
    await logError("browserStreamService.dispatchAction", error.message);
    return { success: false, message: error.message };
  }
};

export const generateErrorFrame = (url = "", errorMessage = "Navigation failed") => {
  const cleanUrl = String(url || "").replace(/&/g, "&amp;").slice(0, 80);
  const cleanErr = String(errorMessage || "Navigation failed").replace(/&/g, "&amp;").slice(0, 200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <rect width="1280" height="800" fill="#0f172a"/>
    <rect x="20" y="20" width="1240" height="48" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
    <circle cx="48" cy="44" r="6" fill="#ef4444"/>
    <circle cx="68" cy="44" r="6" fill="#f59e0b"/>
    <circle cx="88" cy="44" r="6" fill="#10b981"/>
    <rect x="120" y="30" width="800" height="28" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1"/>
    <text x="140" y="49" fill="#94a3b8" font-family="sans-serif" font-size="13">${cleanUrl}</text>
    <rect x="60" y="160" width="1160" height="480" rx="16" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
    <circle cx="640" cy="280" r="44" fill="#ef4444" fill-opacity="0.15"/>
    <text x="640" y="295" fill="#ef4444" font-family="sans-serif" font-size="44" text-anchor="middle" font-weight="bold">✕</text>
    <text x="640" y="380" fill="#f8fafc" font-family="sans-serif" font-size="24" text-anchor="middle" font-weight="bold">Browser Navigation Error</text>
    <text x="640" y="420" fill="#94a3b8" font-family="sans-serif" font-size="15" text-anchor="middle">Could not load the application career site URL:</text>
    <text x="640" y="450" fill="#38bdf8" font-family="monospace" font-size="14" text-anchor="middle">${cleanUrl}</text>
    <rect x="200" y="490" width="880" height="60" rx="8" fill="#0f172a" stroke="#334155"/>
    <text x="640" y="525" fill="#f87171" font-family="sans-serif" font-size="13" text-anchor="middle">${cleanErr}</text>
  </svg>`;
  return Buffer.from(svg).toString("base64");
};

export const generateLoadingFrame = (url = "", title = "Live Application") => {
  const cleanUrl = String(url || "").replace(/&/g, "&amp;").slice(0, 80);
  const cleanTitle = String(title || "Connecting to live site...").replace(/&/g, "&amp;").slice(0, 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <rect width="1280" height="800" fill="#0f172a"/>
    <rect x="20" y="20" width="1240" height="48" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
    <circle cx="48" cy="44" r="6" fill="#ef4444"/>
    <circle cx="68" cy="44" r="6" fill="#f59e0b"/>
    <circle cx="88" cy="44" r="6" fill="#10b981"/>
    <rect x="120" y="30" width="800" height="28" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1"/>
    <text x="140" y="49" fill="#94a3b8" font-family="sans-serif" font-size="13">${cleanUrl}</text>
    <circle cx="640" cy="380" r="32" fill="none" stroke="#3b82f6" stroke-width="4" stroke-dasharray="100 60"/>
    <text x="640" y="450" fill="#f8fafc" font-family="sans-serif" font-size="20" text-anchor="middle" font-weight="bold">${cleanTitle}</text>
    <text x="640" y="480" fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle">Streaming active Playwright browser viewport...</text>
  </svg>`;
  return Buffer.from(svg).toString("base64");
};

export const setBrowserError = (applicationId, error) => {
  const appIdStr = String(applicationId);
  const streamState = getOrCreateStreamState(appIdStr);
  streamState.browserError = error;
  broadcastToApp(appIdStr, {
    type: "BROWSER_ERROR",
    error,
    timestamp: Date.now(),
  });
};

/**
 * Retrieves the latest screencast frame (base64 JPEG/SVG) and browser metadata for an application.
 *
 * @param {string} applicationId
 * @returns {object}
 */
export const getLatestBrowserFrame = (applicationId) => {
  const appIdStr = String(applicationId);
  const streamState = getOrCreateStreamState(appIdStr);
  const session = SessionRegistry.getSession(appIdStr);
  const page = SessionRegistry.getActivePage(appIdStr);

  const currentUrl = page?.url() || streamState.currentUrl || "";
  const pageTitle = streamState.pageTitle || "Live Application";

  // When a real page exists or navigation is in progress, show screencast frame, error frame, or loading frame
  let frame = streamState.latestFrame;
  if (!frame && streamState.browserError) {
    frame = generateErrorFrame(currentUrl, streamState.browserError);
  } else if (!frame && page) {
    frame = generateLoadingFrame(currentUrl, pageTitle);
  } else if (!frame) {
    frame = null;
  }

  return {
    applicationId: appIdStr,
    frame: frame || null,
    currentUrl,
    pageTitle,
    isLive: Boolean(page && !page.isClosed()),
    controlMode: session?.controlMode || CONTROL_MODES.AI,
    humanReason: session?.humanReason || null,
    humanMessage: session?.humanMessage || null,
    browserError: streamState.browserError || null,
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
  const page = SessionRegistry.getActivePage(appIdStr);
  const streamState = getOrCreateStreamState(appIdStr);

  const initialFrame =
    streamState.latestFrame ||
    (streamState.browserError
      ? generateErrorFrame(page?.url() || streamState.currentUrl || "", streamState.browserError)
      : page
      ? generateLoadingFrame(
          page?.url() || streamState.currentUrl || "",
          streamState.pageTitle || "Live Job Portal Application"
        )
      : null);

  // Send initial connected metadata & latest frame immediately
  ws.send(
    JSON.stringify({
      type: REALTIME_EVENTS.BROWSER_STARTED,
      applicationId: appIdStr,
      currentUrl: page?.url() || streamState.currentUrl || "",
      isLive: Boolean(page && !page.isClosed()),
      controlMode: session?.controlMode || CONTROL_MODES.AI,
      humanReason: session?.humanReason || null,
      humanMessage: session?.humanMessage || null,
      browserError: streamState.browserError || null,
      data: initialFrame,
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

  ws.on("close", async () => {
    clients.delete(ws);
    if (clients.size === 0) {
      clientSubscribers.delete(appIdStr);
      await releaseHeldInputs(appIdStr).catch(() => {});
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
  const page = SessionRegistry.getActivePage(appIdStr);

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
  releaseHeldInputs,
  cleanupStreamState,
  generateErrorFrame,
  setBrowserError,
};
