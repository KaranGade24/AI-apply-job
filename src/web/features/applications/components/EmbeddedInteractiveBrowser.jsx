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
  FileText,
  Upload,
  Hand,
  Keyboard,
  ExternalLink,
  Edit3,
  Sparkles,
  Lock,
} from "lucide-react";
import {
  takeControlApi,
  returnControlApi,
  resumeAfterVerificationApi,
  dispatchBrowserActionApi,
  getBrowserFrameApi,
  saveEditedAnswersApi,
} from "../../../services/applicationService";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

export const EmbeddedInteractiveBrowser = ({
  applicationId,
  initialUrl = "",
  jobTitle = "",
  companyName = "",
  candidateInfo = null,
  application = null,
  onFieldChange = null,
  onStatusChange = null,
  onSubmitForm = null,
}) => {
  const [frameSrc, setFrameSrc] = useState(null);
  const [currentUrl, setCurrentUrl] = useState(
    initialUrl || application?.pageAnalysis?.currentUrl || "https://www.naukri.com"
  );
  const [urlInput, setUrlInput] = useState(
    initialUrl || application?.pageAnalysis?.currentUrl || "https://www.naukri.com"
  );
  const [pageTitle, setPageTitle] = useState(
    jobTitle ? `${jobTitle} - Application Portal` : "Live Job Portal Application"
  );
  const [isLive, setIsLive] = useState(true);
  const [controlMode, setControlMode] = useState("AI"); // "AI" | "HUMAN"
  const [humanReason, setHumanReason] = useState(application?.form?.humanReason || null);
  const [humanMessage, setHumanMessage] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [actionPending, setActionPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState(null);
  const [quickText, setQuickText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeField, setActiveField] = useState("fullName");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Directly editable form data for the interactive live browser canvas
  const [formData, setFormData] = useState({
    fullName: candidateInfo?.name || candidateInfo?.fullName || "Candidate",
    email: candidateInfo?.email || "test2@gmail.com",
    phone: candidateInfo?.phone || "",
    experience: candidateInfo?.experience || "1-2 Years",
    currentLocation: candidateInfo?.location || "Pune, India",
    noticePeriod: candidateInfo?.noticePeriod || "Immediate / 15 Days",
    expectedSalary: candidateInfo?.expectedCtc || "Competitive / Market Standard",
    keySkills: candidateInfo?.skills ? (Array.isArray(candidateInfo.skills) ? candidateInfo.skills.join(", ") : candidateInfo.skills) : "React, Node.js, Express, JavaScript",
    coverLetter: candidateInfo?.coverLetter || "I am enthusiastic about this opportunity and look forward to discussing my technical qualifications.",
    otpOrCaptcha: "",
    resumeAttached: true,
    resumeName: candidateInfo?.resumeName || "Tailored_ATS_Resume.pdf",
  });

  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Sync candidateInfo or application into formData if updated
  useEffect(() => {
    if (candidateInfo) {
      setFormData((prev) => ({
        ...prev,
        fullName: candidateInfo.name || candidateInfo.fullName || prev.fullName,
        email: candidateInfo.email || prev.email,
        phone: candidateInfo.phone || prev.phone,
        experience: candidateInfo.experience || prev.experience,
        currentLocation: candidateInfo.location || prev.currentLocation,
        noticePeriod: candidateInfo.noticePeriod || prev.noticePeriod,
        expectedSalary: candidateInfo.expectedCtc || prev.expectedSalary,
        keySkills: candidateInfo.skills
          ? Array.isArray(candidateInfo.skills)
            ? candidateInfo.skills.join(", ")
            : candidateInfo.skills
          : prev.keySkills,
      }));
    }
  }, [candidateInfo]);

  // Handle direct editing of fields inside the browser window
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setActiveField(field);

    if (onFieldChange) {
      onFieldChange(field, value);
    }

    // Auto-persist changes to application answers if applicationId is provided
    if (applicationId) {
      saveEditedAnswersApi(applicationId, { [field]: value }).catch(() => {});
    }

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

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
          const prefix =
            data.frame.startsWith("<svg") || data.frame.startsWith("data:")
              ? ""
              : data.frame.startsWith("PHN2Zy")
              ? "data:image/svg+xml;base64,"
              : "data:image/jpeg;base64,";
          setFrameSrc(data.frame.startsWith("data:") ? data.frame : `${prefix}${data.frame}`);
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
              const prefix = msg.data.startsWith("PHN2Zy")
                ? "data:image/svg+xml;base64,"
                : "data:image/jpeg;base64,";
              setFrameSrc(`${prefix}${msg.data}`);
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
            } else if (
              msg.type === "HUMAN_CONTROL_ENDED" ||
              msg.type === "VERIFICATION_COMPLETED"
            ) {
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
      if (!wsConnected) {
        fetchSingleFrame();
      }
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
  }, [applicationId, fetchSingleFrame, onStatusChange, wsConnected]);

  // Quick type string into active field or send to browser
  const handleSendQuickText = async (e) => {
    e?.preventDefault();
    const textToInsert = quickText.trim();
    if (!textToInsert) return;

    // Update the active field in the live interactive form
    if (activeField && formData.hasOwnProperty(activeField)) {
      handleInputChange(activeField, textToInsert);
    } else {
      handleInputChange("otpOrCaptcha", textToInsert);
    }

    await sendBrowserAction({ type: "type", text: textToInsert });
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
            Live Application Browser
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 animate-pulse">
              <CheckCircle2 className="w-3 h-3" /> Field updated & synced
            </span>
          )}

          {isHumanMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Manual Control / Verification</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <Bot className="w-3.5 h-3.5" />
              <span>AI Autonomous Active</span>
            </div>
          )}

          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            use-browser-js • 1280×800
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
                  : "Interactive Manual Mode:"}
              </strong>{" "}
              <span>
                {humanMessage ||
                  "You can directly edit all form fields, paste OTP/captcha, or adjust details below. When ready, click Resume AI."}
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

      {/* 4. FULLY EDITABLE INTERACTIVE BROWSER CANVAS VIEWPORT */}
      <div
        ref={containerRef}
        tabIndex={0}
        className="relative w-full bg-slate-950 flex flex-col justify-start overflow-y-auto outline-hidden text-slate-200"
        style={{
          minHeight: "460px",
          maxHeight: isFullscreen ? "calc(100vh - 170px)" : "680px",
        }}
      >
        <div className="w-full bg-slate-900/60 p-5 space-y-4">
          {/* Portal header badge */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-base shrink-0">
                {companyName ? companyName[0]?.toUpperCase() : "J"}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{jobTitle || "MERN / Full Stack Developer"}</span>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-semibold">
                    Direct Apply Form
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {companyName || "Employer Portal"} • {currentUrl}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                Live Interactive Mode
              </span>
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                <span>Portal Link</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Interactive Form Fields Canvas */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Editable Application Form & Input Fields
                </span>
              </div>
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Click any field below to edit directly
              </span>
            </div>

            {/* Grid of form inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Full Name */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "fullName"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("fullName")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="text"
                  value={formData.fullName}
                  onFocus={() => setActiveField("fullName")}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="Candidate Full Name"
                />
              </div>

              {/* Email Address */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "email"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("email")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Email Address <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onFocus={() => setActiveField("email")}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="candidate@email.com"
                />
              </div>

              {/* Phone Number */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "phone"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("phone")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Phone / Contact Number
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="tel"
                  value={formData.phone}
                  onFocus={() => setActiveField("phone")}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="+91 98765 43210"
                />
              </div>

              {/* Experience */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "experience"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("experience")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Total Experience
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="text"
                  value={formData.experience}
                  onFocus={() => setActiveField("experience")}
                  onChange={(e) => handleInputChange("experience", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="e.g. 2 Years"
                />
              </div>

              {/* Notice Period */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "noticePeriod"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("noticePeriod")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Notice Period
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="text"
                  value={formData.noticePeriod}
                  onFocus={() => setActiveField("noticePeriod")}
                  onChange={(e) => handleInputChange("noticePeriod", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="Immediate / 15 Days / 30 Days"
                />
              </div>

              {/* Expected CTC */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "expectedSalary"
                    ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("expectedSalary")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Expected Salary / CTC
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
                </div>
                <input
                  type="text"
                  value={formData.expectedSalary}
                  onFocus={() => setActiveField("expectedSalary")}
                  onChange={(e) => handleInputChange("expectedSalary", e.target.value)}
                  className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                  placeholder="e.g. 6 - 8 LPA"
                />
              </div>
            </div>

            {/* Key Skills */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                activeField === "keySkills"
                  ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                  : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
              }`}
              onClick={() => setActiveField("keySkills")}
            >
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Relevant Skills & Tech Stack
                </label>
                <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
              </div>
              <input
                type="text"
                value={formData.keySkills}
                onFocus={() => setActiveField("keySkills")}
                onChange={(e) => handleInputChange("keySkills", e.target.value)}
                className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden"
                placeholder="React, Node.js, Express, MongoDB..."
              />
            </div>

            {/* Cover Letter / Pitch */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                activeField === "coverLetter"
                  ? "bg-slate-900 border-blue-500 ring-1 ring-blue-500/30"
                  : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
              }`}
              onClick={() => setActiveField("coverLetter")}
            >
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Cover Letter / Introduction Pitch
                </label>
                <span className="text-[10px] text-blue-400 font-semibold">Editable</span>
              </div>
              <textarea
                rows={3}
                value={formData.coverLetter}
                onFocus={() => setActiveField("coverLetter")}
                onChange={(e) => handleInputChange("coverLetter", e.target.value)}
                className="w-full bg-slate-950 text-white font-medium text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-blue-400 focus:outline-hidden resize-y"
                placeholder="Write or edit your customized pitch for this application..."
              />
            </div>

            {/* Resume Attachment & Verification challenge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ATS Resume Attachment */}
              <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      ATS Resume Attached
                    </span>
                    <p className="text-[11px] text-slate-400">{formData.resumeName}</p>
                  </div>
                </div>
                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] font-semibold">
                  ✓ Verified Attached
                </span>
              </div>

              {/* OTP / Captcha / Custom Verification Field */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  activeField === "otpOrCaptcha"
                    ? "bg-slate-900 border-amber-500 ring-1 ring-amber-500/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveField("otpOrCaptcha")}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Security Code / OTP / Captcha
                  </label>
                  <span className="text-[10px] text-amber-400 font-semibold">Live Input</span>
                </div>
                <input
                  type="text"
                  value={formData.otpOrCaptcha}
                  onFocus={() => setActiveField("otpOrCaptcha")}
                  onChange={(e) => handleInputChange("otpOrCaptcha", e.target.value)}
                  className="w-full bg-slate-950 text-amber-100 font-mono text-xs px-3 py-2 rounded-md border border-slate-700 focus:border-amber-400 focus:outline-hidden"
                  placeholder="Enter or paste OTP / Captcha solution..."
                />
              </div>
            </div>

            {/* In-Browser Apply Action Button */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>All inputs auto-sync directly into the application record.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onSubmitForm) {
                    onSubmitForm(formData);
                  } else {
                    handleResumeAfterVerification();
                  }
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-md transition-colors flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Submit / Confirm Application in Browser</span>
              </button>
            </div>
          </div>
        </div>
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
              placeholder={`Type or paste value into active field (${activeField})...`}
              className="w-full bg-slate-900 text-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>Update Field</span>
          </button>
        </form>

        <div className="flex items-center gap-2">
          {/* Quick chip helpers */}
          <button
            type="button"
            onClick={() => handleInputChange("noticePeriod", "Immediate")}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer hidden md:inline-block"
          >
            Immediate Notice
          </button>

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
