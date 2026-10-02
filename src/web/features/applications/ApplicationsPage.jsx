import React, { useState, useEffect } from 'react';
import {
  MoreVertical,
  ExternalLink,
  Eye,
  Sparkles,
  Check,
  RefreshCw,
  X,
  Trash2,
  AlertCircle,
  Bot,
  Play,
  Plus,
  Globe,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ApplicationReviewModal } from './ApplicationReviewModal';
import {
  getApplicationsApi,
  updateApplicationStatusApi,
  tailorApplicationApi,
  deleteApplicationApi,
  createApplicationApi,
  startAgentWorkflowApi,
  advancePortalActionApi,
} from '../../services/applicationService';
import { formatDate, getStatusBadgeStyle, formatStatusLabel } from '../../utils/formatters';

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [pendingStatuses, setPendingStatuses] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [tailoringId, setTailoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [runningAgentId, setRunningAgentId] = useState(null);
  const [deepDivingId, setDeepDivingId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Autonomous Apply Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [customJobTitle, setCustomJobTitle] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [isAutonomous, setIsAutonomous] = useState(true);
  const [launchingAgent, setLaunchingAgent] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await getApplicationsApi();
      if (res.data) {
        setApplications(res.data);
      } else {
        setApplications([]);
      }
    } catch (err) {
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleSelectStatus = (appId, newStatus) => {
    setPendingStatuses((prev) => ({
      ...prev,
      [appId]: newStatus,
    }));
  };

  const handleSubmitStatus = async (app) => {
    const appId = app._id;
    const targetStatus = pendingStatuses[appId] || app.status || 'pending';
    setUpdatingId(appId);

    try {
      if (targetStatus === 'waiting_for_review') {
        showToast('Reading job details, tailoring resume & drafting message with AI...');
        const res = await tailorApplicationApi(appId);
        const updatedDoc = res.data || { ...app, status: 'waiting_for_review' };
        setApplications((prev) =>
          prev.map((a) => (a._id === appId ? updatedDoc : a))
        );
        showToast('Job analyzed, resume tailored & email drafted! Status updated to Waiting Review.');
      } else {
        await updateApplicationStatusApi(appId, targetStatus);
        setApplications((prev) =>
          prev.map((a) => (a._id === appId ? { ...a, status: targetStatus } : a))
        );
        showToast(`Application status updated to ${targetStatus}`);
      }
    } catch (err) {
      showToast('Error updating status: ' + (err.message || 'Please retry'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTailorAndReview = async (app) => {
    const appId = app._id;
    setTailoringId(appId);
    showToast('AI Agent is reading job, tailoring resume & drafting outreach...');
    try {
      const res = await tailorApplicationApi(appId);
      const updatedDoc = res.data || app;
      setApplications((prev) =>
        prev.map((a) => (a._id === appId ? updatedDoc : a))
      );
      setSelectedApp(updatedDoc);
      showToast('Tailoring complete! Reviewing draft details.');
    } catch (err) {
      // If error, open modal anyway to allow manual review/retry
      setSelectedApp(app);
      showToast('Opened application review details.');
    } finally {
      setTailoringId(null);
    }
  };

  const handleDeepDivePortal = async (app) => {
    const appId = app._id;
    setDeepDivingId(appId);
    const targetTitle = app.pageAnalysis?.matchedRole?.title || app.jobId?.title || 'position';
    showToast(`AI Deep Dive starting autonomous analysis for ${targetTitle}...`);
    try {
      const res = await advancePortalActionApi(appId, app.pageAnalysis?.matchedRole || null);
      const updatedDoc = res.data || app;
      setApplications((prev) =>
        prev.map((a) => (a._id === appId ? updatedDoc : a))
      );
      setSelectedApp(updatedDoc);
      showToast('Deep dive executed! Form inspected, matched & updated.');
    } catch (err) {
      setSelectedApp(app);
      showToast('Deep dive notice: ' + (err.message || 'Please review application details'));
    } finally {
      setDeepDivingId(null);
    }
  };

  const handleDeleteApplication = async (appId, status) => {
    // Restriction check
    const isApproved = status === 'Approved' || status === 'approved';
    const isLocked = ['applied', 'sent', 'interview', 'offer', 'rejected'].includes(status?.toLowerCase());
    
    if (isApproved || isLocked) {
      showToast(`Cannot delete an application that is already ${isApproved ? 'approved' : 'processed'}.`);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this application?')) return;

    setDeletingId(appId);
    try {
      await deleteApplicationApi(appId);
      setApplications(applications.filter((a) => a._id !== appId));
      showToast('Application deleted successfully');
    } catch (err) {
      showToast('Failed to delete application: ' + (err.message || 'Error'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleLaunchAutonomousAgent = async (e) => {
    e.preventDefault();
    if (!targetUrl.trim()) {
      showToast('Please enter a target job or career page URL');
      return;
    }

    setLaunchingAgent(true);
    showToast('Creating application record & launching AI Browser Agent...');
    try {
      const createRes = await createApplicationApi({
        sourceUrl: targetUrl.trim(),
        jobTitle: customJobTitle.trim() || 'Software Engineer',
        company: customCompany.trim() || 'Company',
        applicationMethod: 'unknown',
        status: 'pending',
      });

      const newApp = createRes.data || createRes;
      const appId = newApp._id;

      // Start the autonomous browser agent workflow
      await startAgentWorkflowApi(appId, {
        autoApply: isAutonomous,
        sourceUrl: targetUrl.trim(),
      }).catch((err) => {
        console.warn('Agent start warning:', err);
      });

      showToast('AI Browser Agent launched! Navigating to site and analyzing form...');
      setIsApplyModalOpen(false);
      setTargetUrl('');
      setCustomJobTitle('');
      setCustomCompany('');

      // Refresh applications and open review/activity modal
      await fetchApplications();
      setSelectedApp(newApp);
    } catch (err) {
      showToast('Failed to launch AI agent: ' + (err.message || 'Please retry'));
    } finally {
      setLaunchingAgent(false);
    }
  };

  const handleRunAgentForApp = async (app) => {
    setRunningAgentId(app._id);
    showToast(`Starting Autonomous AI Agent for ${app.jobId?.title || 'position'}...`);
    try {
      await startAgentWorkflowApi(app._id, { autoApply: true }).catch(() => {});
      setSelectedApp(app);
      showToast('AI Agent is running! Inspect live activity in the modal.');
    } catch (err) {
      showToast('Failed to start agent: ' + (err.message || 'Please retry'));
    } finally {
      setRunningAgentId(null);
    }
  };

  const isActionRequired = (status) => {
    const s = String(status || '').toLowerCase();
    return ['human_required', 'failed', 'google_login_required', 'waiting_for_final_review', 'unsupported_method', 'session_expired'].includes(s);
  };

  const filterTabs = [
    { id: 'All', label: 'All' },
    { id: 'action_required', label: 'Action Required / Retry' },
    { id: 'waiting_for_review', label: 'Waiting Review' },
    { id: 'pending', label: 'Pending' },
    { id: 'Applied', label: 'Applied' },
    { id: 'Interview', label: 'Interview' },
    { id: 'Offer', label: 'Offer' },
    { id: 'Rejected', label: 'Rejected' },
  ];

  const counts = {
    All: applications.length,
    action_required: applications.filter((a) => isActionRequired(a.status)).length,
    waiting_for_review: applications.filter(
      (a) =>
        a.status === 'waiting_for_review' ||
        a.status === 'waiting_for_final_review' ||
        a.status === 'human_required' ||
        a.status === 'resolving_answers'
    ).length,
    pending: applications.filter((a) => a.status?.toLowerCase() === 'pending' || a.status === 'processing').length,
    Applied: applications.filter(
      (a) => a.status === 'Applied' || a.status === 'sent' || a.status === 'approved'
    ).length,
    Interview: applications.filter((a) => a.status === 'Interview').length,
    Offer: applications.filter((a) => a.status === 'Offer').length,
    Rejected: applications.filter((a) => a.status === 'Rejected').length,
  };

  const filteredApps = applications.filter((a) => {
    if (filter === 'All') return true;
    if (filter === 'action_required') {
      return isActionRequired(a.status);
    }
    if (filter === 'waiting_for_review') {
      return (
        a.status === 'waiting_for_review' ||
        a.status === 'waiting_for_final_review' ||
        a.status === 'human_required' ||
        a.status === 'resolving_answers'
      );
    }
    if (filter === 'Applied') {
      return a.status === 'Applied' || a.status === 'sent' || a.status === 'approved';
    }
    return a.status?.toLowerCase() === filter.toLowerCase();
  });

  const getLogoInitial = (company) => (company ? company.charAt(0).toUpperCase() : 'C');
  const getLogoColor = (company) => {
    const code = (company || 'A').charCodeAt(0) % 3;
    if (code === 0) return 'bg-blue-600';
    if (code === 1) return 'bg-slate-800';
    return 'bg-emerald-700';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track your job applications, tailor resumes per job, review email drafts, and manage status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsApplyModalOpen(true)}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md cursor-pointer"
          >
            <Bot className="w-4 h-4 text-cyan-200" />
            <span>Apply on Any Site (AI Agent)</span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              filter === tab.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label} ({counts[tab.id] || 0})
          </button>
        ))}
      </div>

      {/* Applications Table Card */}
      <Card className="p-0 overflow-hidden border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Job Title</th>
                <th className="py-3.5 px-6">Company</th>
                <th className="py-3.5 px-6">Channel / Method</th>
                <th className="py-3.5 px-6">Applied Date</th>
                <th className="py-3.5 px-6">Status & Update</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading applications...
                  </td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    No applications found for selected status tab.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const title = app.jobTitle || app.jobId?.title || 'Position';
                  const company = app.company || app.jobId?.company || 'Company';
                  const sourceUrl = app.sourceUrl || app.jobId?.sourceUrl || '';
                  const method =
                    app.applicationMethod ||
                    app.jobId?.applicationMethod ||
                    (app.jobId?.hrEmail ? 'email' : 'portal');
                  const appliedDate = app.appliedDate || app.createdAt;
                  const currentSelectedStatus =
                    pendingStatuses[app._id] || app.status || 'pending';
                  const isStatusDirty =
                    pendingStatuses[app._id] &&
                    pendingStatuses[app._id] !== (app.status || 'pending');
                  const isUpdating = updatingId === app._id;
                  const isTailoring = tailoringId === app._id;
                  const isLocked = ['applied', 'sent', 'interview', 'offer', 'rejected'].includes(app.status?.toLowerCase());
                  const needsAction = isActionRequired(app.status);

                  return (
                    <tr
                      key={app._id}
                      onClick={() => setSelectedApp(app)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* Job Title */}
                      <td className="py-4 px-6 font-semibold text-slate-900 flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg ${getLogoColor(
                            company
                          )} text-white font-bold text-xs flex items-center justify-center shrink-0`}
                        >
                          {getLogoInitial(company)}
                        </div>
                        <div className="min-w-0">
                          <span className="truncate max-w-xs block font-bold text-slate-900">
                            {title}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {app.jobId?.location || app.location || 'Remote'}
                          </span>
                          {((app.pageAnalysis?.openingsList && app.pageAnalysis.openingsList.length > 0) || app.pageAnalysis?.matchedRole?.title) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {app.pageAnalysis?.openingsList?.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">
                                  📋 {app.pageAnalysis.openingsList.length} Extracted Titles
                                </span>
                              )}
                              {app.pageAnalysis?.matchedRole?.title && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-semibold truncate max-w-[200px]" title={`Best match: ${app.pageAnalysis.matchedRole.title}`}>
                                  🎯 {app.pageAnalysis.matchedRole.title}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Company */}
                      <td className="py-4 px-6 text-slate-700 font-medium">{company}</td>

                      {/* Channel / Method */}
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 capitalize border border-slate-200">
                          {method}
                        </span>
                      </td>

                      {/* Applied Date */}
                      <td className="py-4 px-6 text-slate-500 tabular-nums text-xs">
                        {formatDate(appliedDate)}
                      </td>

                      {/* Status Dropdown with Explicit SUBMIT Button */}
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <select
                            value={currentSelectedStatus}
                            onChange={(e) => handleSelectStatus(app._id, e.target.value)}
                            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer ${getStatusBadgeStyle(
                              currentSelectedStatus
                            )}`}
                          >
                            {needsAction && (
                              <option value={app.status}>{formatStatusLabel(app.status)}</option>
                            )}
                            {!isLocked && <option value="pending">Pending</option>}
                            {!isLocked && <option value="waiting_for_review">Waiting Review</option>}
                            <option value="Applied">Applied</option>
                            <option value="Interview">Interview</option>
                            <option value="Offer">Offer</option>
                            <option value="Rejected">Rejected</option>
                          </select>

                          {/* Submit button to save status changes */}
                          <button
                            type="button"
                            onClick={() => handleSubmitStatus(app)}
                            disabled={isUpdating}
                            title="Submit Status Change"
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                              isStatusDirty
                                ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                            }`}
                          >
                            {isUpdating ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Submit</span>
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-4 px-6 text-right space-x-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Direct Review & Retry button for action required or failed applications */}
                        {needsAction && (
                          <button
                            type="button"
                            onClick={() => setSelectedApp(app)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Review questions and retry application"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                            <span>Review & Retry</span>
                          </button>
                        )}

                        {/* Dedicated Tailor & Draft Button: reads job, tailors resume, writes mail */}
                        <div className="inline-flex items-center gap-1">
                          {!isLocked && !needsAction && (
                            <button
                              type="button"
                              onClick={() => handleTailorAndReview(app)}
                              disabled={isTailoring}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                              title="Read job, tailor resume for requirements, and generate draft email/pitch"
                            >
                              {isTailoring ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                              ) : (
                                <Sparkles className="w-3 h-3 text-blue-600" />
                              )}
                              <span>Tailor & Draft</span>
                            </button>
                          )}

                          {isTailoring && (
                            <button
                              type="button"
                              onClick={() => setTailoringId(null)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Cancel visual state"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Autonomous Browser Agent Button */}
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => handleRunAgentForApp(app)}
                            disabled={runningAgentId === app._id}
                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Run autonomous LLM browser agent to fill and apply"
                          >
                            {runningAgentId === app._id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                            ) : (
                              <Bot className="w-3.5 h-3.5 text-indigo-600" />
                            )}
                            <span>Run AI Agent</span>
                          </button>
                        )}

                        {/* Autonomous Deep Dive Button */}
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => handleDeepDivePortal(app)}
                            disabled={deepDivingId === app._id}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title={`Autonomous Deep Dive: analyze page, match role, fill form & advance`}
                          >
                            {deepDivingId === app._id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-700" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5 text-amber-700" />
                            )}
                            <span>Deep Dive</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedApp(app)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3 h-3" /> Details
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteApplication(app._id, app.status)}
                          disabled={deletingId === app._id || isLocked || app.status === 'Approved'}
                          className={`p-1.5 rounded-lg transition-all shadow-2xs cursor-pointer ${
                            isLocked || app.status === 'Approved'
                              ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 bg-white border border-slate-200'
                          }`}
                          title={isLocked || app.status === 'Approved' ? "Cannot delete approved/applied application" : "Delete application"}
                        >
                          {deletingId === app._id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {sourceUrl && (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors shadow-2xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Application Review & Detailed Verification Modal */}
      {selectedApp && (
        <ApplicationReviewModal
          isOpen={!!selectedApp}
          job={selectedApp.jobId || selectedApp}
          initialApplication={selectedApp}
          onClose={() => setSelectedApp(null)}
          onApplicationUpdated={fetchApplications}
        />
      )}

      {/* Autonomous Apply on Any Site Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Autonomous Job Application</h2>
                  <p className="text-xs text-slate-500">Apply to any career page, Greenhouse, Lever, or Workday form</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchAutonomousAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Job or Application URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://boards.greenhouse.io/company/jobs/12345 or any career page"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Works on Greenhouse, Lever, Workday, Taleo, Ashby, LinkedIn, or custom employer portals.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Job Title (Optional)"
                  value={customJobTitle}
                  onChange={(e) => setCustomJobTitle(e.target.value)}
                  placeholder="e.g. Full Stack Developer"
                />
                <Input
                  label="Company Name (Optional)"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="e.g. Stripe, Airbnb"
                />
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAutonomous}
                  onChange={(e) => setIsAutonomous(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Full Autonomous Mode (Do all tasks itself)
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5">
                    Agent inspects interactive controls, fills form fields from your resume & profile, uploads resume, clicks Next / Agree, and submits autonomously.
                  </span>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsApplyModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={launchingAgent}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch AI Browser Agent</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
