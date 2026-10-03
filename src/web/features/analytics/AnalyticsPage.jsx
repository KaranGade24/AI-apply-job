import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Globe,
  PieChart,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getAnalyticsApi } from '../../services/queueService';

export const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await getAnalyticsApi();
      if (res?.data) {
        setData(res.data);
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const overview = data?.overview || {
    jobsFound: 0,
    matchedJobs: 0,
    applications: 0,
    submitted: 0,
    pending: 0,
    failed: 0,
    needsReview: 0,
    responseRate: 0,
  };

  const sources = data?.sources || [];
  const roles = data?.roles || [];
  const timeline = data?.timeline || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          Application & Discovery Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Section 20 — Comprehensive insights on job discovery, AI match rates, multi-source volume, and application conversion.
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-medium text-slate-500">Jobs Discovered</div>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">{overview.jobsFound}</div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Across all configured sources</span>
          </div>
        </Card>

        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-medium text-blue-600">AI Matched (≥70%)</div>
          <div className="text-3xl font-extrabold text-blue-700 mt-1">{overview.matchedJobs}</div>
          <div className="text-[11px] text-blue-500 mt-1 flex items-center gap-1">
            <span>{overview.jobsFound > 0 ? Math.round((overview.matchedJobs / overview.jobsFound) * 100) : 0}% match rate</span>
          </div>
        </Card>

        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-medium text-emerald-600">Submitted Applications</div>
          <div className="text-3xl font-extrabold text-emerald-700 mt-1">{overview.submitted}</div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <span>Fully validated & sent</span>
          </div>
        </Card>

        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-medium text-indigo-600">Response / Callback Rate</div>
          <div className="text-3xl font-extrabold text-indigo-700 mt-1">{overview.responseRate}%</div>
          <div className="text-[11px] text-indigo-500 mt-1 flex items-center gap-1">
            <span>Interviews & recruiter replies</span>
          </div>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">Pending Execution</span>
          <span className="text-sm font-bold text-slate-800">{overview.pending}</span>
        </div>
        <div className="p-3 bg-white rounded-lg border border-amber-200 bg-amber-50/20 flex items-center justify-between">
          <span className="text-xs text-amber-700">Waiting for User</span>
          <span className="text-sm font-bold text-amber-800">{overview.needsReview}</span>
        </div>
        <div className="p-3 bg-white rounded-lg border border-rose-200 bg-rose-50/20 flex items-center justify-between">
          <span className="text-xs text-rose-700">Failed / Blocked</span>
          <span className="text-sm font-bold text-rose-800">{overview.failed}</span>
        </div>
        <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">Total Pipeline</span>
          <span className="text-sm font-bold text-slate-800">{overview.applications}</span>
        </div>
      </div>

      {/* Application Funnel & Source Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Funnel */}
        <Card className="p-5 border-slate-200 bg-white">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-blue-600" />
            AI Application Funnel
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>1. Discovered Jobs</span>
                <span className="font-bold text-slate-900">{overview.jobsFound}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-300 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>2. AI Profile Matched (≥70%)</span>
                <span className="font-bold text-slate-900">{overview.matchedJobs}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${overview.jobsFound > 0 ? (overview.matchedJobs / overview.jobsFound) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>3. Deep Dive & Tailored</span>
                <span className="font-bold text-slate-900">{overview.applications}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full"
                  style={{ width: `${overview.jobsFound > 0 ? (overview.applications / overview.jobsFound) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>4. Submitted</span>
                <span className="font-bold text-slate-900">{overview.submitted}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{ width: `${overview.jobsFound > 0 ? (overview.submitted / overview.jobsFound) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Source Breakdown */}
        <Card className="p-5 border-slate-200 bg-white">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-blue-600" />
            Applications by Job Source
          </h3>

          {sources.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No source telemetry captured yet.</p>
          ) : (
            <div className="space-y-3">
              {sources.map((s) => (
                <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="font-bold text-blue-600">{s.count} applications</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Role Breakdown & Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Breakdown */}
        <Card className="p-5 border-slate-200 bg-white">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-blue-600" />
            Top Roles Applied For
          </h3>

          {roles.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No role metrics available yet.</p>
          ) : (
            <div className="space-y-2.5">
              {roles.map((r) => (
                <div key={r.title} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-700 truncate max-w-[280px]">{r.title}</span>
                  <span className="font-semibold text-slate-900">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity Timeline */}
        <Card className="p-5 border-slate-200 bg-white">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-600" />
            Recent 7-Day Activity
          </h3>

          <div className="grid grid-cols-7 gap-2 text-center pt-2">
            {timeline.map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400">{day.day}</span>
                <div className="w-full bg-slate-100 rounded-md h-20 flex items-end justify-center p-1 overflow-hidden">
                  <div
                    className="w-full bg-blue-600 rounded-sm transition-all"
                    style={{ height: `${Math.min(100, Math.max(12, day.count * 20))}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800">{day.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsPage;
