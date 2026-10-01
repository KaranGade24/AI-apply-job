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

  return (
    <section className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Agent Activity
          </h3>
        </div>
        {loading && (
          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
        )}
      </div>
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-slate-400 block">Status</span>
            <strong className="text-slate-800">{status.status}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Page</span>
            <strong className="text-slate-800">
              {status.pageType || "Unknown"}
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block">Step</span>
            <strong className="text-slate-800">{status.stepCount || 0}</strong>
          </div>
        </div>
      )}
      {events.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {events
            .slice(-8)
            .reverse()
            .map((event, index) => (
              <div
                key={`${event.timestamp || "event"}-${index}`}
                className="flex items-start gap-2 text-[11px] text-slate-600"
              >
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>
                  {event.action || event.pageType || "Agent step"}
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
