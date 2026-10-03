import React, { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  getAgentEventsApi,
  getAgentStatusApi,
} from "../../../services/applicationService";

const ACTIVE_STATUSES = new Set([
  "STARTING",
  "OPENING_SITE",
  "ANALYZING_PAGE",
  "NAVIGATING",
  "DETECTING_FORM",
  "FILLING",
  "WAITING_FOR_USER",
  "WAITING_FOR_HUMAN",
  "WAITING_FOR_CONFIRMATION",
  "SUBMITTING",
  "VERIFYING",
]);

export const AgentActivityPanel = ({ applicationId }) => {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!applicationId) return undefined;
    let cancelled = false;

    const refresh = async () => {
      setLoading(true);
      try {
        const [statusResponse, eventsResponse] = await Promise.all([
          getAgentStatusApi(applicationId),
          getAgentEventsApi(applicationId),
        ]);
        if (cancelled) return;
        setStatus(statusResponse?.data || null);
        setEvents(eventsResponse?.data?.events || []);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    const timer = window.setInterval(() => {
      if (ACTIVE_STATUSES.has(status?.status)) refresh();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applicationId, status?.status]);

  if (!applicationId || (!status && events.length === 0)) return null;

  const isHumanNeeded =
    status?.status === "WAITING_FOR_HUMAN" ||
    status?.status === "WAITING_FOR_USER" ||
    status?.pageType === "CAPTCHA_OR_BLOCKED" ||
    status?.controlMode === "HUMAN";

  return (
    <section className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Agent Live Activity & Workflow
          </h3>
          {isHumanNeeded && (
            <span className="px-2 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold animate-pulse">
              Action Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          )}
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Agent Status</span>
            <strong className="text-slate-800 font-semibold">{status.status || "IDLE"}</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Active Stage</span>
            <strong className="text-slate-800 font-semibold">
              {status.pageType || "Job Application Portal"}
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Completed Steps</span>
            <strong className="text-slate-800 font-semibold">{status.stepCount || 0} actions</strong>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-1 max-h-28 overflow-y-auto pt-1 border-t border-slate-200/80">
          {events
            .slice(-6)
            .reverse()
            .map((event, index) => (
              <div
                key={`${event.timestamp || "event"}-${index}`}
                className="flex items-start gap-2 text-[11px] text-slate-600"
              >
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>
                  {event.action || event.pageType || "Agent action"}
                  {event.pageUrl ? ` · ${event.pageUrl}` : ""}
                </span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
};

export default AgentActivityPanel;
