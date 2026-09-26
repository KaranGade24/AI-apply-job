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
  ArrowRight,
  ExternalLink,
  CheckCircle,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ThumbsUp
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getApplicationsApi } from '../../services/applicationService';
import { getDiscoveredJobsApi, deleteJobApi } from '../../services/jobService';
import { useNaukri } from '../../context/NaukriContext';

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isConnected, naukriStatus, openNaukriModal, refreshNaukriStatus } = useNaukri();

  const [stats, setStats] = useState({
    totalJobs: 0,
    applicationsSent: 0,
    interviewsScheduled: 0,
    successRate: '0.0%',
  });

  const [matchedJobs, setMatchedJobs] = useState([]);
  const [approvedJobs, setApprovedJobs] = useState(new Set());
  const [activities, setActivities] = useState([]);
  const [tailoredResumes, setTailoredResumes] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const loadData = () => {
    Promise.all([
      getApplicationsApi({ limit: 100 }),
      getDiscoveredJobsApi(),
      refreshNaukriStatus()
    ])
      .then(([appsRes, jobsRes]) => {
        const apps = appsRes.data || [];
        const jobs = jobsRes.data || [];
        const interviews = apps.filter((a) => a.status === 'Interview').length;
        const totalSent = apps.length;
        const rate = totalSent > 0 ? ((interviews / totalSent) * 100).toFixed(1) : '0.0';

        setStats({
          totalJobs: jobs.length,
          applicationsSent: totalSent,
          interviewsScheduled: interviews,
          successRate: `${rate}%`,
        });

        setMatchedJobs(jobs);

        // Dynamic activities from real applications
        const recentActivities = apps.slice(0, 5).map((app, idx) => {
          const title = app.jobTitle || app.jobId?.title || 'Position';
          const company = app.company || app.jobId?.company || 'Company';
          return {
            id: app._id || idx,
            type: 'applied',
            text: `Applied to ${title} at ${company}`,
            time: new Date(app.appliedDate || app.createdAt || Date.now()).toLocaleDateString(),
          };
        });

        setActivities(recentActivities);

        // Filter for tailored resumes
        const tailored = apps
          .filter((app) => app.resume?.tailoredResumeData || app.resume?.pdfPath)
          .map((app) => ({
            id: app._id,
            company: app.company || app.jobId?.company || 'Company',
            jobTitle: app.jobTitle || app.jobId?.title || 'Position',
            date: new Date(app.updatedAt || app.createdAt).toLocaleDateString(),
          }));
        setTailoredResumes(tailored);
      })
      .catch(() => {
        // Safe fallback
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveJob = (job) => {
    // User approval is the boundary: no automatic submission!
    setApprovedJobs((prev) => new Set([...prev, job._id]));
    showToast(`Approved "${job.title}". Job queued for review workflow (No application submitted).`);
  };

  const handleViewJob = (job) => {
    const url = job.sourceUrl || job.applicationUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      await deleteJobApi(jobId);
      setMatchedJobs((prev) => prev.filter((j) => j._id !== jobId));
      showToast('Job removed from matched list.');
    } catch {
      showToast('Failed to delete job.');
    }
  };

  const handleViewResume = (appId) => {
    const token = localStorage.getItem('token');
    const url = `/api/applications/${appId}/pdf${token ? `?token=${token}` : ''}`;
    window.open(url, '_blank');
  };

  const isNaukriConnected = naukriStatus?.connected || naukriStatus?.status === 'connected';
  const isNaukriExpired = naukriStatus?.status === 'authenticationRequired';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white border border-slate-700 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, {user?.username || user?.email?.split('@')[0] || 'User'}! 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Discover matched jobs from Naukri & partner sources with AI precision.
          </p>
        </div>

        {/* Quick Search Shortcut */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/jobs')}
            className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Search className="w-3.5 h-3.5" /> Start Job Search
          </Button>
        </div>
      </div>

      {/* Naukri Integration Status Card (Dashboard Step 1) */}
      <Card className="p-4 sm:p-5 border-blue-100 bg-gradient-to-r from-blue-50/40 via-white to-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
              N
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900">Naukri Integration</h2>
                {isNaukriConnected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Connected
                  </span>
                ) : isNaukriExpired ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertTriangle className="w-3 h-3 text-amber-600" /> Session Expired (Manual Reconnect Required)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isNaukriConnected
                  ? `Authenticated session active. User: ${naukriStatus?.userName || 'Verified Profile'}`
                  : isNaukriExpired
                  ? 'Your Naukri session has expired. Re-authenticate to search & extract Naukri jobs.'
                  : 'Connect your Naukri account using encrypted browser session tokens. Zero credentials stored.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <Button
              size="sm"
              variant={isNaukriConnected ? 'outline' : 'default'}
              onClick={() => openNaukriModal(() => loadData())}
              className="text-xs font-bold cursor-pointer"
            >
              {isNaukriConnected ? 'Manage Naukri Session' : 'Connect Naukri'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 4 Grid Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Total Jobs Found</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.totalJobs}</p>
            <p className="text-xs font-semibold text-blue-600">Discovered & Filtered</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Search className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Approved by User</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{approvedJobs.size}</p>
            <p className="text-xs font-semibold text-emerald-600">Approval Boundary</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ThumbsUp className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Applications Sent</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.applicationsSent}</p>
            <p className="text-xs font-semibold text-purple-600">Tracked</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Send className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5 hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Success Rate</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{stats.successRate}</p>
            <p className="text-xs font-semibold text-amber-600">Conversion</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Award className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Matched Jobs Section (Steps 26 & 27: Dashboard Approval Boundary) */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Matched Jobs</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {matchedJobs.length} Available
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and approve discovered opportunities. <strong className="font-semibold text-slate-700">No application is submitted automatically</strong> without explicit approval.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/jobs')}
            className="text-xs font-semibold self-start sm:self-auto cursor-pointer"
          >
            View in Search <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {matchedJobs.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No matched jobs discovered yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Run job discovery with your target keywords, experience, and location to see matching opportunities here.
            </p>
            <Button
              size="sm"
              onClick={() => navigate('/jobs')}
              className="mt-4 text-xs font-bold cursor-pointer"
            >
              Discover Jobs Now
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchedJobs.slice(0, 8).map((job) => {
              const isApproved = approvedJobs.has(job._id);
              const isNaukri = job.source === 'naukri';
              const skillCount = job.skills?.length || job.matchedSkills?.length || 0;

              return (
                <div
                  key={job._id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white shadow-xs transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                              isNaukri
                                ? 'bg-blue-600 text-white'
                                : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {isNaukri ? 'Naukri' : 'Referral'}
                          </span>

                          {job.applicationMethod && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                              {job.applicationMethod === 'naukri' ? 'Naukri Apply' : job.applicationMethod.replace('_', ' ')}
                            </span>
                          )}

                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            {job.matchScore || 85}% Match
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors mt-1.5 truncate">
                          {job.title}
                        </h3>

                        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mt-0.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {job.company || 'Company'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap pt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {job.location || 'India'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        {job.experienceRequired || '0–1 Years'}
                      </span>
                    </div>

                    {/* Matching Skills count */}
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md">
                        <Sparkles className="w-3 h-3" />
                        Matching Skills: {skillCount}
                      </span>
                    </div>
                  </div>

                  {/* Action Boundary Buttons: [View Job] [Approve Application] */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewJob(job)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 h-8"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> View Job
                    </Button>

                    <Button
                      size="sm"
                      variant={isApproved ? 'outline' : 'default'}
                      onClick={() => handleApproveJob(job)}
                      disabled={isApproved}
                      className={`text-xs font-bold px-3.5 h-8 cursor-pointer ${
                        isApproved
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isApproved ? '✓ Approved' : 'Approve Application'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Tailored Resumes Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <FileCheck className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Tailored Resumes</h2>
          </div>
          <p className="text-xs text-slate-500">{tailoredResumes.length} resumes created</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tailoredResumes.length === 0 ? (
            <div className="col-span-full text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
              <p className="text-xs text-slate-400">No tailored resumes generated yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => navigate('/jobs')}
              >
                Find a Job to Tailor
              </Button>
            </div>
          ) : (
            tailoredResumes.map((res) => (
              <div
                key={res.id}
                className="flex flex-col p-4 rounded-xl border border-slate-100 bg-slate-50/30 hover:border-blue-200 hover:bg-white transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                    {res.company}
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{res.jobTitle}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    {res.date}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => handleViewResume(res.id)}
                  >
                    View Resume
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Recent Activity Card */}
      <Card className="p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              No recent activity yet. Discover jobs or connect Naukri to track progress!
            </div>
          ) : (
            activities.map((act) => (
              <div
                key={act.id}
                className="flex items-start gap-3.5 pb-3.5 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                  <Send className="w-4 h-4 text-blue-600" />
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
    </div>
  );
};

export default DashboardPage;
