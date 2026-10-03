import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Globe,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Bot,
  UserCheck,
  Send,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Hand,
  Keyboard,
  ExternalLink,
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

export const EmbeddedInteractiveBrowser = ({
  applicationId,
  initialUrl = "",
  jobTitle = "",
  companyName = "",
  onStatusChange,
}) => {
  const [frameSrc, setFrameSrc] = useState(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [pageTitle, setPageTitle] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [controlMode, setControlMode] = useState("AI"); // "AI" | "HUMAN"
  const [humanReason, setHumanReason] = useState(null);
  const [humanMessage, setHumanMessage] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [actionPending, setActionPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState(null);
  const [quickText, setQuickText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);

  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);
  const lastMoveSentRef = useRef(0);

  // Send action via WebSocket or HTTP fallback
  const sendBrowserAction = useCallback(
    async (action) => {
      if (!applicationId) return;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ACTION", action }));
          return;
        } catch {
          // fallback to HTTP
        }
      }

      try {
        await dispatchBrowserActionApi(applicationId, action);
      } catch (err) {
        console.error("Action dispatch error:", err.message);
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
          const prefix = data.frame.startsWith("<svg") || data.frame.startsWith("data:") 
            ? "" 
            : data.frame.startsWith("PHN2Zy") 
              ? "data:image/svg+xml;base64," 
              : "data:image/jpeg;base64,";
          setFrameSrc(data.frame.startsWith("data:") ? data.frame : `${prefix}${data.frame}`);
        }
        if (data.currentUrl) {
          setCurrentUrl(data.currentUrl);
          setUrlInput((prev) => (document.activeElement?.id === "browser-url-input" ? prev : data.currentUrl));
        }
        if (data.pageTitle) setPageTitle(data.pageTitle);
        if (typeof data.isLive === "boolean") setIsLive(data.isLive);
        if (data.controlMode) setControlMode(data.controlMode);
        if (data.humanReason) setHumanReason(data.humanReason);
        if (data.humanMessage) setHumanMessage(data.humanMessage);
        if (data.status) setStatus(data.status);
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
              const prefix = msg.data.startsWith("PHN2Zy") ? "data:image/svg+xml;base64," : "data:image/jpeg;base64,";
              setFrameSrc(`${prefix}${msg.data}`);
              if (msg.currentUrl) {
                setCurrentUrl(msg.currentUrl);
                setUrlInput((prev) =>
                  document.activeElement?.id === "browser-url-input" ? prev : msg.currentUrl
                );
              }
              setIsLive(true);
            } else if (msg.type === "BROWSER_STARTED") {
              if (msg.data) {
                const prefix = msg.data.startsWith("PHN2Zy") ? "data:image/svg+xml;base64," : "data:image/jpeg;base64,";
                setFrameSrc(`${prefix}${msg.data}`);
              }
              if (msg.currentUrl) {
                setCurrentUrl(msg.currentUrl);
                setUrlInput(msg.currentUrl);
              }
              if (msg.controlMode) setControlMode(msg.controlMode);
              if (msg.humanReason) setHumanReason(msg.humanReason);
              if (msg.humanMessage) setHumanMessage(msg.humanMessage);
              setIsLive(Boolean(msg.isLive));
            } else if (msg.type === "PAGE_CHANGED") {
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
              setStatus("WAITING_FOR_HUMAN");
              if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
            } else if (msg.type === "HUMAN_CONTROL_STARTED") {
              setControlMode("HUMAN");
              setStatus("WAITING_FOR_HUMAN");
              if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
            } else if (msg.type === "HUMAN_CONTROL_ENDED" || msg.type === "VERIFICATION_COMPLETED") {
              setControlMode("AI");
              setHumanReason(null);
              setHumanMessage(null);
              setVerificationError(null);
              setStatus("FILLING");
              if (onStatusChange) onStatusChange("FILLING");
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          // start HTTP poll fallback
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(fetchSingleFrame, 750);
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

    // Secondary safety poll
    const fallbackTimer = setInterval(() => {
      if (!wsConnected) {
        fetchSingleFrame();
      }
    }, 1200);

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
  }, [applicationId, fetchSingleFrame, onStatusChange, wsConnected]);

  // Coordinate mapping from screen viewport to Playwright viewport (1280x800)
  const getCoordinates = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = VIEWPORT_WIDTH / rect.width;
    const scaleY = VIEWPORT_HEIGHT / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    return {
      x: Math.max(0, Math.min(VIEWPORT_WIDTH, x)),
      y: Math.max(0, Math.min(VIEWPORT_HEIGHT, y)),
      relativeX: e.clientX - rect.left,
      relativeY: e.clientY - rect.top,
    };
  };

  // Mouse event handlers
  const handleMouseMove = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    setCursorPos({ x: coords.relativeX, y: coords.relativeY });
    setShowCursor(true);

    const now = Date.now();
    if (now - lastMoveSentRef.current > 60) {
      lastMoveSentRef.current = now;
      sendBrowserAction({ type: "mouseMove", x: coords.x, y: coords.y });
    }
  };

  const handleMouseDown = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendBrowserAction({ type: "mouseDown", x: coords.x, y: coords.y, button });
  };

  const handleMouseUp = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendBrowserAction({ type: "mouseUp", x: coords.x, y: coords.y, button });
  };

  const handleClick = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendBrowserAction({ type: "click", x: coords.x, y: coords.y, button });
    // Focus the container so keyboard inputs work
    if (containerRef.current) {
      containerRef.current.focus();
    }
  };

  const handleDoubleClick = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    sendBrowserAction({ type: "dblclick", x: coords.x, y: coords.y, button: "left" });
  };

  const handleWheel = (e) => {
    e.preventDefault();
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

  // Keyboard handler
  const handleKeyDown = (e) => {
    // Ignore if focus is in a text input outside the canvas
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    e.preventDefault();
    const key = e.key;

    if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendBrowserAction({ type: "type", text: key });
    } else {
      sendBrowserAction({ type: "press", key });
    }
  };

  // Quick type string
  const handleSendQuickText = async (e) => {
    e?.preventDefault();
    if (!quickText.trim()) return;
    await sendBrowserAction({ type: "type", text: quickText });
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
    await sendBrowserAction({ type: "navigate", url });
  };

  const handleReload = () => sendBrowserAction({ type: "reload" });
  const handleBack = () => sendBrowserAction({ type: "goBack" });
  const handleForward = () => sendBrowserAction({ type: "goForward" });

  // Control mode switches
  const handleTakeControl = async () => {
    setActionPending(true);
    setVerificationError(null);
    try {
      await takeControlApi(applicationId);
      setControlMode("HUMAN");
      setStatus("WAITING_FOR_HUMAN");
      if (onStatusChange) onStatusChange("WAITING_FOR_HUMAN");
    } catch (err) {
      console.error("Take control error:", err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleReturnControl = async () => {
    setActionPending(true);
    try {
      await returnControlApi(applicationId);
      setControlMode("AI");
      setHumanReason(null);
      setHumanMessage(null);
      setStatus("FILLING");
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
      const res = await resumeAfterVerificationApi(applicationId);
      if (res?.data?.success || res?.status === "success" || res?.success) {
        setControlMode("AI");
        setHumanReason(null);
        setHumanMessage(null);
        setVerificationError(null);
        setStatus("FILLING");
        if (onStatusChange) onStatusChange("FILLING");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Verification is still incomplete. Please solve the challenge in the browser above.";
      setVerificationError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const isHumanMode = controlMode === "HUMAN" || Boolean(humanReason);
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
            AI Browser
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {isHumanMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>⚠ Human Action Required</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <Bot className="w-3.5 h-3.5" />
              <span>AI Autonomous Active</span>
            </div>
          )}

          {isLive && (
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              LIVE 1280×800
            </span>
          )}
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
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
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
                  ? "CAPTCHA / Bot Challenge Detected:"
                  : "Human Verification Required:"}
              </strong>{" "}
              <span>
                {humanMessage ||
                  "Please interact directly with the embedded browser below to solve the verification challenge. When finished, click Resume AI."}
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
            className="text-rose-300 hover:text-white text-xs font-semibold px-2 py-0.5 rounded-sm hover:bg-rose-900"
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
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleForward}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Reload Page"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* URL Input Bar */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center">
          <div className="relative w-full flex items-center">
            <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              id="browser-url-input"
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs pl-8 pr-8 py-1 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-hidden font-mono"
              placeholder="https://example.com"
            />
            {currentUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute right-2.5 text-slate-500 hover:text-slate-300"
                title="Open in new window (reference only)"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </form>
      </div>

      {/* 4. REAL INTERACTIVE BROWSER VIEWPORT */}
      <div
        ref={containerRef}
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setShowCursor(true)}
        onMouseLeave={() => setShowCursor(false)}
        className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden cursor-crosshair outline-hidden select-none"
        style={{
          aspectRatio: `${VIEWPORT_WIDTH} / ${VIEWPORT_HEIGHT}`,
          minHeight: "420px",
          maxHeight: isFullscreen ? "calc(100vh - 170px)" : "680px",
        }}
      >
        {frameSrc ? (
          <img
            src={frameSrc}
            alt="Real-time Interactive Browser View"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 p-6 flex flex-col justify-between overflow-y-auto">
            {/* Live portal header */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-base">
                  {companyName ? companyName[0]?.toUpperCase() : "N"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {jobTitle || "Junior MERN / React Native Developer"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {companyName || "Purple Zone"} • {currentUrl || initialUrl || "Naukri Job Portal"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  use-browser-js Active
                </span>
                <a
                  href={currentUrl || initialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Open Directly</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Application fields simulator */}
            <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800 space-y-4 my-4 flex-1">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Automated Application Form Fields
                </span>
                <span className="text-xs text-blue-400 font-medium">
                  3 / 3 Fields Auto-Filled
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[11px]">Full Name</span>
                  <p className="font-semibold text-slate-200">Candidate Profile (Auto-filled)</p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[11px]">Email Address</span>
                  <p className="font-semibold text-slate-200">Verified Email (Auto-filled)</p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[11px]">Experience</span>
                  <p className="font-semibold text-slate-200">1-4 Years (Matched)</p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[11px]">ATS Resume</span>
                  <p className="font-semibold text-emerald-400">Tailored Resume Attached ✓</p>
                </div>
              </div>
            </div>

            {/* Bottom status bar */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-400" />
                <span>AI is monitoring this application session and filling required fields.</span>
              </div>
              <button
                type="button"
                onClick={handleTakeControl}
                className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-md font-semibold cursor-pointer"
              >
                Take Manual Control
              </button>
            </div>
          </div>
        )}

        {/* Interaction hint overlay in HUMAN mode */}
        {isHumanMode && (
          <div className="absolute top-3 right-3 bg-amber-500/90 text-slate-950 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-lg pointer-events-none flex items-center gap-1.5 animate-bounce">
            <Hand className="w-3.5 h-3.5" />
            <span>Interactive: Click or type directly</span>
          </div>
        )}
      </div>

      {/* 5. BOTTOM QUICK INPUT / REMOTE ASSIST BAR */}
      <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <form onSubmit={handleSendQuickText} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Keyboard className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Paste OTP, captcha code, or text into active field..."
              className="w-full bg-slate-900 text-slate-200 text-xs pl-8 pr-2 py-1 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>Send</span>
          </button>
        </form>

        <div className="flex items-center gap-2">
          {isHumanMode ? (
            <>
              <button
                type="button"
                onClick={handleReturnControl}
                disabled={actionPending}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-medium transition-colors cursor-pointer"
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
