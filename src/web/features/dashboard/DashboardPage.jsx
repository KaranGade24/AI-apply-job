import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Send,
  CalendarCheck,
  Award,
  Bot,
  FileCheck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getApplicationsApi } from '../../services/applicationService';
import { getDiscoveredJobsApi } from '../../services/jobService';

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalJobs: 0,
    applicationsSent: 0,
    interviewsScheduled: 0,
    successRate: '0.0%',
  });

  const [activities, setActivities] = useState([]);

  useEffect(() => {
    Promise.all([getApplicationsApi(), getDiscoveredJobsApi()])
      .then(([appsRes, jobsRes]) => {
        const apps = appsRes.data || [];
        const jobs = jobsRes.data || [];
        const interviews = apps.filter(a => a.status === 'Interview').length;
        const totalSent = apps.length;
        const rate = totalSent > 0 ? ((interviews / totalSent) * 100).toFixed(1) : '0.0';

        setStats({
          totalJobs: jobs.length,
          applicationsSent: totalSent,
          interviewsScheduled: interviews,
          successRate: `${rate}%`,
        });

        // Dynamic activities from real applications
        const recentActivities = apps.slice(0, 5).map((app, idx) => ({
          id: app._id || idx,
          type: 'applied',
          text: `Applied to ${app.jobTitle} at ${app.company}`,
          time: new Date(app.appliedDate || app.createdAt || Date.now()).toLocaleDateString(),
        }));

        setActivities(recentActivities);
      })
      .catch(() => {
        // Safe fallback
      });
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome back, {user?.username || user?.email?.split('@')[0] || 'User'}! 👋
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Let's find your next opportunity with AI.
        </p>
      </div>

      {/* 4 Grid Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1 */}
        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Total Jobs Found</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.totalJobs}</p>
            <p className="text-xs font-semibold text-blue-600">+12 this week</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Search className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 2 */}
        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Applications Sent</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.applicationsSent}</p>
            <p className="text-xs font-semibold text-emerald-600">+5 this week</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Send className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 3 */}
        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Interviews Scheduled</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.interviewsScheduled}</p>
            <p className="text-xs font-semibold text-purple-600">+2 this week</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 4 */}
        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Success Rate</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.successRate}</p>
            <p className="text-xs font-semibold text-amber-600">+2.1% this week</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Award className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Lower Section (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Card (2 cols) */}
        <Card className="lg:col-span-2 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No recent activity yet. Discover and apply to jobs to track progress!
              </div>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="flex items-start gap-3.5 pb-3.5 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                    {act.type === 'applied' && <Send className="w-4 h-4 text-blue-600" />}
                    {act.type === 'resume' && <FileCheck className="w-4 h-4 text-emerald-600" />}
                    {act.type === 'match' && <Sparkles className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{act.text}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{act.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right AI Callout Box */}
        <Card className="p-6 bg-gradient-to-br from-blue-50/50 via-white to-slate-50/50 flex flex-col items-center text-center justify-center border-blue-100">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
            <Bot className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Let AI Find Better Jobs For You</h3>
          <p className="text-xs text-slate-500 mb-6 max-w-xs leading-relaxed">
            Upload your resume and let our AI match you with the best opportunities.
          </p>
          <Button onClick={() => navigate('/jobs')} className="w-full">
            Find Jobs <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>
      </div>
    </div>
  );
};
