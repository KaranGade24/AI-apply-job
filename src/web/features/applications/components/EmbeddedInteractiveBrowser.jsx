import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Globe,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Bot,
  Send,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  Hand,
  Keyboard,
  ExternalLink,
  Lock,
} from "lucide-react";
import {
  takeControlApi,
  returnControlApi,
  resumeAfterVerificationApi,
  dispatchBrowserActionApi,
  getBrowserFrameApi,
} from "../../../services/applicationService";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

const formatFrameSrc = (rawFrame) => {
  if (!rawFrame) return null;
  const str = String(rawFrame).trim();
  if (str.startsWith("data:")) return str;
  if (str.startsWith("<svg") || str.startsWith("<?xml")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(str)}`;
  }
  try {
    const decodedStart = atob(str.slice(0, 32)).trim();
    if (decodedStart.startsWith("<svg") || decodedStart.startsWith("<?xml")) {
      return `data:image/svg+xml;base64,${str}`;
    }
  } catch {}
  if (str.startsWith("PHN2") || str.startsWith("PD94")) {
    return `data:image/svg+xml;base64,${str}`;
  }
  return `data:image/jpeg;base64,${str}`;
};

export const EmbeddedInteractiveBrowser = ({
  applicationId,
  initialUrl = "",
  jobTitle = "",
  companyName = "",
  onStatusChange = null,
}) => {
  const [frameSrc, setFrameSrc] = useState(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl || "https://www.naukri.com");
  const [urlInput, setUrlInput] = useState(initialUrl || "https://www.naukri.com");
  const [pageTitle, setPageTitle] = useState(
    jobTitle ? `${jobTitle} - Application Portal` : "Live Job Portal Application"
  );
  const [isLive, setIsLive] = useState(false);
  const [controlMode, setControlMode] = useState("AI"); // "AI" | "HUMAN"
  const [humanReason, setHumanReason] = useState(null);
  const [humanMessage, setHumanMessage] = useState(null);
  const [actionPending, setActionPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState(null);
  const [browserError, setBrowserError] = useState(null);
  const [quickText, setQuickText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);

  // References to track real-time interaction state without excessive React re-renders
  const isFocusedRef = useRef(false);
  const isMouseDownRef = useRef(false);
  const lastMoveSentRef = useRef(0);
  const pendingMoveTimerRef = useRef(null);
  const isHumanModeRef = useRef(false);

  const isHumanMode = controlMode === "HUMAN" || Boolean(humanReason);
  isHumanModeRef.current = isHumanMode;

  // Send action via WebSocket or HTTP fallback
  const sendBrowserAction = useCallback(
    async (action) => {
      if (!applicationId) return;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ACTION", action }));
          return;
        } catch {
          // fallback to HTTP below
        }
      }

      try {
        await dispatchBrowserActionApi(applicationId, action);
      } catch (err) {
        // Silently ignore transient dispatch errors
      }
    },
    [applicationId]
  );

  // Poll fallback for frame if WebSocket is disconnected
  const fetchSingleFrame = useCallback(async () => {
    if (!applicationId) return;
    try {
      const res = await getBrowserFrameApi(applicationId);
      const data = res?.data || res;
      if (data) {
        if (data.frame) {
          setFrameSrc(formatFrameSrc(data.frame));
        }
        if (data.currentUrl) {
          setCurrentUrl(data.currentUrl);
          setUrlInput((prev) =>
            document.activeElement?.id === "browser-url-input" ? prev : data.currentUrl
          );
        }
        if (data.pageTitle) setPageTitle(data.pageTitle);
        if (typeof data.isLive === "boolean") setIsLive(data.isLive);
        if (data.controlMode) setControlMode(data.controlMode);
        if (data.humanReason) setHumanReason(data.humanReason);
        if (data.humanMessage) setHumanMessage(data.humanMessage);
        if (data.browserError) setBrowserError(data.browserError);
      }
    } catch {
      // Ignore polling errors
    }
  }, [applicationId]);

  // Connect WebSocket & fallback poll
  useEffect(() => {
    if (!applicationId) return;

    let isMounted = true;

    const setupWs = () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/applications/${applicationId}/agent/stream`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "FRAME" && msg.data) {
              setFrameSrc(formatFrameSrc(msg.data));
              if (msg.currentUrl) {
                setCurrentUrl(msg.currentUrl);
                setUrlInput((prev) =>
                  document.activeElement?.id === "browser-url-input" ? prev : msg.currentUrl
                );
              }
              setIsLive(true);
            } else if (msg.type === "BROWSER_STARTED") {
              if (msg.currentUrl) {
                setCurrentUrl(msg.currentUrl);
                setUrlInput((prev) =>
                  document.activeElement?.id === "browser-url-input" ? prev : msg.currentUrl
                );
              }
              if (msg.data) {
                setFrameSrc(formatFrameSrc(msg.data));
              }
              if (msg.controlMode) setControlMode(msg.controlMode);
              if (msg.humanReason) setHumanReason(msg.humanReason);
              if (msg.humanMessage) setHumanMessage(msg.humanMessage);
              setIsLive(Boolean(msg.isLive));
            } else if (msg.type === "BROWSER_ERROR") {
              setBrowserError(msg.error || "Browser navigation error");
            } else if (msg.type === "PAGE_CHANGED") {
              setBrowserError(null);
              if (msg.url) {
                setCurrentUrl(msg.url);
                setUrlInput(msg.url);
              }
              if (msg.title) setPageTitle(msg.title);
            } else if (
              msg.type === "HUMAN_INTERVENTION_REQUIRED" ||
              msg.type === "CAPTCHA_DETECTED" ||
              msg.type === "MFA_DETECTED"
            ) {
              setControlMode("HUMAN");
              setHumanReason(msg.humanReason || "CAPTCHA_REQUIRED");
              setHumanMessage(
                msg.humanMessage ||
                  "Human verification required. Solve the challenge inside the embedded browser."
              );
              if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
            } else if (msg.type === "HUMAN_CONTROL_STARTED") {
              setControlMode("HUMAN");
              if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
            } else if (
              msg.type === "HUMAN_CONTROL_ENDED" ||
              msg.type === "VERIFICATION_COMPLETED"
            ) {
              setControlMode("AI");
              setHumanReason(null);
              setHumanMessage(null);
              setVerificationError(null);
              if (onStatusChange) onStatusChange("FILLING");
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(fetchSingleFrame, 1000);
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    fetchSingleFrame();
    setupWs();

    const fallbackTimer = setInterval(() => {
      fetchSingleFrame();
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(fallbackTimer);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, [applicationId, fetchSingleFrame, onStatusChange]);

  // Coordinate mapping from screen / element viewport to Playwright viewport (1280x800)
  // Correctly handles object-contain scaling, pillarboxing, and letterboxing
  const getCoordinates = useCallback((e) => {
    const targetElement = imageRef.current || containerRef.current;
    if (!targetElement) return null;

    const rect = targetElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const natW = VIEWPORT_WIDTH;
    const natH = VIEWPORT_HEIGHT;

    const containerRatio = rect.width / rect.height;
    const imageRatio = natW / natH;

    let renderedW, renderedH, offsetX, offsetY;

    if (containerRatio > imageRatio) {
      // Container is wider than the image: pillarbox (black bars on left & right)
      renderedH = rect.height;
      renderedW = rect.height * imageRatio;
      offsetX = (rect.width - renderedW) / 2;
      offsetY = 0;
    } else {
      // Container is taller than the image: letterbox (black bars on top & bottom)
      renderedW = rect.width;
      renderedH = rect.width / imageRatio;
      offsetX = 0;
      offsetY = (rect.height - renderedH) / 2;
    }

    const relativeX = e.clientX - rect.left - offsetX;
    const relativeY = e.clientY - rect.top - offsetY;

    // Clamp within image bounds
    const clampedX = Math.max(0, Math.min(renderedW, relativeX));
    const clampedY = Math.max(0, Math.min(renderedH, relativeY));

    // Scale up to Playwright viewport (1280 x 800)
    const scaleX = natW / renderedW;
    const scaleY = natH / renderedH;

    return {
      x: Math.round(clampedX * scaleX),
      y: Math.round(clampedY * scaleY),
      inBounds: relativeX >= 0 && relativeX <= renderedW && relativeY >= 0 && relativeY <= renderedH,
    };
  }, []);

  // Throttled mouse move event handler
  const handleMouseMove = useCallback(
    (e) => {
      if (!isHumanModeRef.current) return;
      const coords = getCoordinates(e);
      if (!coords) return;

      const now = performance.now();
      // Throttle to ~30 fps (approx every 33ms) to avoid network flooding
      if (now - lastMoveSentRef.current >= 33) {
        lastMoveSentRef.current = now;
        if (pendingMoveTimerRef.current) {
          clearTimeout(pendingMoveTimerRef.current);
          pendingMoveTimerRef.current = null;
        }
        sendBrowserAction({ type: "mouseMove", x: coords.x, y: coords.y });
      } else if (!pendingMoveTimerRef.current) {
        // Coalesce: ensure final resting cursor position is sent
        pendingMoveTimerRef.current = setTimeout(() => {
          pendingMoveTimerRef.current = null;
          lastMoveSentRef.current = performance.now();
          sendBrowserAction({ type: "mouseMove", x: coords.x, y: coords.y });
        }, 35);
      }
    },
    [getCoordinates, sendBrowserAction]
  );

  // Mouse down handler
  const handleMouseDown = useCallback(
    (e) => {
      if (!isHumanModeRef.current) return;
      const coords = getCoordinates(e);
      if (!coords) return;

      // Focus the container so keyboard inputs work
      if (containerRef.current) {
        containerRef.current.focus();
      }
      isFocusedRef.current = true;
      setIsFocused(true);
      isMouseDownRef.current = true;

      const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
      sendBrowserAction({ type: "mouseDown", x: coords.x, y: coords.y, button });
    },
    [getCoordinates, sendBrowserAction]
  );

  // Mouse up handler
  const handleMouseUp = useCallback(
    (e) => {
      if (!isHumanModeRef.current) return;
      const coords = getCoordinates(e);
      if (!coords) return;

      isMouseDownRef.current = false;
      const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
      sendBrowserAction({ type: "mouseUp", x: coords.x, y: coords.y, button });
    },
    [getCoordinates, sendBrowserAction]
  );

  // Click handler (noop: mouseDown + mouseUp handle click natively in Playwright to prevent duplicate clicks)
  const handleClick = useCallback(() => {}, []);

  // Double click handler
  const handleDoubleClick = useCallback(
    (e) => {
      if (!isHumanModeRef.current) return;
      const coords = getCoordinates(e);
      if (!coords) return;

      sendBrowserAction({ type: "dblclick", x: coords.x, y: coords.y, button: "left" });
    },
    [getCoordinates, sendBrowserAction]
  );

  // Context menu handler (prevents host browser menu on right-click without duplicate event)
  const handleContextMenu = useCallback(
    (e) => {
      if (!isHumanModeRef.current) return;
      e.preventDefault();
    },
    []
  );

  // Global drag release and move listener (ensures dragging out-of-bounds doesn't get stuck)
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isMouseDownRef.current && isHumanModeRef.current) {
        handleMouseMove(e);
      }
    };

    const handleGlobalMouseUp = (e) => {
      if (isMouseDownRef.current && isHumanModeRef.current) {
        isMouseDownRef.current = false;
        const coords = getCoordinates(e);
        const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
        sendBrowserAction({
          type: "mouseUp",
          x: coords ? coords.x : 0,
          y: coords ? coords.y : 0,
          button,
        });
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (pendingMoveTimerRef.current) clearTimeout(pendingMoveTimerRef.current);
    };
  }, [getCoordinates, handleMouseMove, sendBrowserAction]);

  // Non-passive wheel event listener: prevents outer React page from scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      if (!isHumanModeRef.current) return;

      // Prevent outer page/modal from scrolling
      e.preventDefault();
      e.stopPropagation();

      const coords = getCoordinates(e);
      if (!coords) return;

      sendBrowserAction({
        type: "wheel",
        x: coords.x,
        y: coords.y,
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [getCoordinates, sendBrowserAction]);

  // Keyboard handlers: only captured when browser is focused and in HUMAN mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isHumanModeRef.current || !isFocusedRef.current) return;

      // Do NOT intercept if typing in an input or textarea
      const targetTag = e.target?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA" || e.target?.isContentEditable) {
        return;
      }

      // Prevent browser default behavior (scrolling on Space/Arrows, Tab navigation outside, etc.)
      e.preventDefault();
      e.stopPropagation();

      sendBrowserAction({ type: "keyDown", key: e.key, code: e.code });
    };

    const handleKeyUp = (e) => {
      if (!isHumanModeRef.current || !isFocusedRef.current) return;

      const targetTag = e.target?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA" || e.target?.isContentEditable) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      sendBrowserAction({ type: "keyUp", key: e.key, code: e.code });
    };

    const handleFocusOut = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
        isFocusedRef.current = false;
        setIsFocused(false);
        // Release any held modifier keys on blur
        sendBrowserAction({ type: "resetInput" });
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleFocusOut);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleFocusOut);
    };
  }, [sendBrowserAction]);

  // Quick type text from the assist bar
  const handleSendQuickText = async (e) => {
    e?.preventDefault();
    const textToInsert = quickText.trim();
    if (!textToInsert) return;

    await sendBrowserAction({ type: "type", text: textToInsert });
    await sendBrowserAction({ type: "press", key: "Enter" });
    setQuickText("");
  };

  // Navigation handlers
  const handleNavigate = async (e) => {
    e?.preventDefault();
    let url = urlInput.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    setCurrentUrl(url);
    await sendBrowserAction({ type: "navigate", url });
  };

  const handleReload = () => {
    fetchSingleFrame();
    sendBrowserAction({ type: "reload" });
  };
  const handleBack = () => sendBrowserAction({ type: "goBack" });
  const handleForward = () => sendBrowserAction({ type: "goForward" });

  // Control mode switches
  const handleTakeControl = async () => {
    setActionPending(true);
    setVerificationError(null);
    try {
      const targetUrl = currentUrl || initialUrl || "https://www.naukri.com";
      await takeControlApi(applicationId, { targetUrl });
      setControlMode("HUMAN");
      isHumanModeRef.current = true;
      setIsLive(true);
      if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
      fetchSingleFrame();
      setTimeout(() => {
        fetchSingleFrame();
        if (containerRef.current) {
          containerRef.current.focus();
          isFocusedRef.current = true;
          setIsFocused(true);
        }
      }, 500);
    } catch (err) {
      console.error("Take control error:", err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleReturnControl = async () => {
    setActionPending(true);
    try {
      await sendBrowserAction({ type: "resetInput" });
      await returnControlApi(applicationId);
      setControlMode("AI");
      isHumanModeRef.current = false;
      setHumanReason(null);
      setHumanMessage(null);
      setIsFocused(false);
      isFocusedRef.current = false;
      if (onStatusChange) onStatusChange("FILLING");
    } catch (err) {
      console.error("Return control error:", err.message);
    } finally {
      setActionPending(false);
    }
  };

  // "I'm Done — Resume AI" with verification check
  const handleResumeAfterVerification = async () => {
    setVerifying(true);
    setVerificationError(null);
    try {
      await sendBrowserAction({ type: "resetInput" });
      const res = await resumeAfterVerificationApi(applicationId);
      if (res?.data?.success || res?.status === "success" || res?.success) {
        setControlMode("AI");
        isHumanModeRef.current = false;
        setHumanReason(null);
        setHumanMessage(null);
        setVerificationError(null);
        setIsFocused(false);
        isFocusedRef.current = false;
        if (onStatusChange) onStatusChange("FILLING");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Verification is still incomplete. Please finish the action in the browser.";
      setVerificationError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const isCaptchaChallenge =
    humanReason === "CAPTCHA_REQUIRED" ||
    humanReason === "captcha" ||
    (humanMessage && humanMessage.toLowerCase().includes("captcha"));

  return (
    <div
      className={`flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl transition-all ${
        isFullscreen ? "fixed inset-4 z-50 rounded-2xl" : "w-full"
      }`}
    >
      {/* 1. TOP HEADER & HUMAN INTERVENTION BAR */}
      <div className="bg-slate-950 px-4 py-2.5 flex items-center justify-between border-b border-slate-800 gap-3">
        {/* Title & Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          <span className="font-bold text-xs tracking-wider text-slate-200 uppercase flex items-center gap-1.5 ml-2">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            Live Application Browser
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {isHumanMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Manual Control (Active)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <Bot className="w-3.5 h-3.5" />
              <span>AI Autonomous Active</span>
            </div>
          )}

          {isHumanMode && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                isFocused
                  ? "bg-blue-600/30 text-blue-300 border border-blue-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {isFocused ? "Keyboard Focused" : "Click inside to type"}
            </span>
          )}

          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            1280×800
          </span>
        </div>

        {/* Primary Controls */}
        <div className="flex items-center gap-2">
          {isHumanMode ? (
            <button
              type="button"
              onClick={handleResumeAfterVerification}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-emerald-500/20 cursor-pointer disabled:opacity-60"
            >
              {verifying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>I&apos;m Done — Resume AI</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTakeControl}
              disabled={actionPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-amber-500/20 cursor-pointer disabled:opacity-60"
              title="Pause AI and interact directly inside the browser"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Take Control</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Browser"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* 2. CAPTCHA / HUMAN INTERVENTION BANNER */}
      {isHumanMode && (
        <div className="bg-amber-950/80 border-b border-amber-600/40 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-amber-200 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <strong className="font-bold text-amber-100 block sm:inline">
                {isCaptchaChallenge
                  ? "Security / CAPTCHA Challenge:"
                  : humanReason === "UNKNOWN_QUESTION"
                  ? "Action Required:"
                  : "Interactive Manual Control:"}
              </strong>{" "}
              <span>
                {humanReason === "UNKNOWN_QUESTION"
                  ? "AI needs your input. Please complete or edit this field directly in the browser."
                  : (humanMessage || "Interact directly with the browser: click, type, drag, and scroll to complete your action. Click 'Resume AI' when finished.")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResumeAfterVerification}
            disabled={verifying}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "I'm Done — Resume AI"}
          </button>
        </div>
      )}

      {/* Browser Navigation Error Banner */}
      {browserError && (
        <div className="bg-rose-950/90 border-b border-rose-600/50 px-4 py-2.5 text-rose-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span><strong>Browser Error:</strong> {browserError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBrowserError(null)}
            className="text-rose-300 hover:text-white text-xs font-semibold px-2 py-0.5 rounded-sm hover:bg-rose-900 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Verification Error Feedback Alert */}
      {verificationError && (
        <div className="bg-rose-950/90 border-b border-rose-600/50 px-4 py-2 text-rose-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{verificationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setVerificationError(null)}
            className="text-rose-300 hover:text-white text-xs font-semibold px-2 py-0.5 rounded-sm hover:bg-rose-900 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. BROWSER NAVIGATION BAR */}
      <div className="bg-slate-900/90 px-3 py-2 flex items-center gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={handleBack}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
          title="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleForward}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
          title="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
          title="Reload Page"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* URL Input Bar */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center">
          <div className="relative w-full flex items-center">
            <Lock className="w-3 h-3 text-emerald-400 absolute left-2.5 pointer-events-none" />
            <input
              id="browser-url-input"
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs pl-8 pr-8 py-1.5 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-hidden font-mono"
              placeholder="https://example.com"
            />
            {currentUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute right-2.5 text-slate-400 hover:text-white"
                title="Open directly in browser tab"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </form>
      </div>

      {/* 4. REAL INTERACTIVE STREAMED BROWSER VIEWPORT */}
      <div
        ref={containerRef}
        tabIndex={0}
        onFocus={() => {
          isFocusedRef.current = true;
          setIsFocused(true);
        }}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            isFocusedRef.current = false;
            setIsFocused(false);
            sendBrowserAction({ type: "resetInput" });
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={`relative w-full bg-slate-950 flex items-center justify-center overflow-hidden outline-hidden select-none transition-shadow ${
          isHumanMode
            ? isFocused
              ? "cursor-default ring-2 ring-blue-500/50"
              : "cursor-pointer ring-1 ring-amber-500/30"
            : "cursor-not-allowed"
        }`}
        style={{
          aspectRatio: `${VIEWPORT_WIDTH} / ${VIEWPORT_HEIGHT}`,
          minHeight: "440px",
          maxHeight: isFullscreen ? "calc(100vh - 170px)" : "680px",
        }}
      >
        {frameSrc ? (
          <img
            ref={imageRef}
            src={frameSrc}
            alt="Real-time Streamed Browser View"
            className="w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-5 p-8 text-center bg-slate-950">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <p className="text-base font-bold text-slate-100">
                Connecting to Live Browser...
              </p>
              <p className="text-xs text-slate-300">
                Initializing Playwright browser session, injecting authenticated cookies, and streaming live viewport.
              </p>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Target URL: <span className="text-blue-400">{currentUrl || "Application Portal"}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTakeControl}
                disabled={actionPending}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
              >
                {actionPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Reconnecting...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Force Refresh Browser</span>
                  </>
                )}
              </button>
              {currentUrl && (
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open URL in Tab</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Human Mode interaction banner overlay */}
        {isHumanMode && (
          <div className="absolute top-3 right-3 bg-amber-500/90 text-slate-950 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-lg pointer-events-none flex items-center gap-1.5">
            <Hand className="w-3.5 h-3.5" />
            <span>{isFocused ? "Active: Mouse & Keys enabled" : "Click to focus and type"}</span>
          </div>
        )}
      </div>

      {/* 5. BOTTOM QUICK INPUT / REMOTE ASSIST BAR */}
      <div className="bg-slate-950 px-4 py-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <form onSubmit={handleSendQuickText} className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Keyboard className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Paste OTP, captcha code, or text into active field..."
              className="w-full bg-slate-900 text-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>Send to Field</span>
          </button>
        </form>

        <div className="flex items-center gap-2">
          {isHumanMode ? (
            <>
              <button
                type="button"
                onClick={handleReturnControl}
                disabled={actionPending}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-medium transition-colors cursor-pointer"
              >
                Return to AI
              </button>
              <button
                type="button"
                onClick={handleResumeAfterVerification}
                disabled={verifying}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-md text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>I&apos;m Done — Resume AI</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleTakeControl}
              disabled={actionPending}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Take Control</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmbeddedInteractiveBrowser;
