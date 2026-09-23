import React, { useState, useEffect } from 'react';
import { MoreVertical, ExternalLink, Eye, Sparkles, Check, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ApplicationReviewModal } from './ApplicationReviewModal';
import {
  getApplicationsApi,
  updateApplicationStatusApi,
  tailorApplicationApi,
} from '../../services/applicationService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [pendingStatuses, setPendingStatuses] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [tailoringId, setTailoringId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

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

  const filterTabs = [
    { id: 'All', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'waiting_for_review', label: 'Waiting Review' },
    { id: 'Applied', label: 'Applied' },
    { id: 'Interview', label: 'Interview' },
    { id: 'Offer', label: 'Offer' },
    { id: 'Rejected', label: 'Rejected' },
  ];

  const counts = {
    All: applications.length,
    pending: applications.filter((a) => a.status?.toLowerCase() === 'pending').length,
    waiting_for_review: applications.filter((a) => a.status === 'waiting_for_review').length,
    Applied: applications.filter(
      (a) => a.status === 'Applied' || a.status === 'sent' || a.status === 'approved'
    ).length,
    Interview: applications.filter((a) => a.status === 'Interview').length,
    Offer: applications.filter((a) => a.status === 'Offer').length,
    Rejected: applications.filter((a) => a.status === 'Rejected').length,
  };

  const filteredApps = applications.filter((a) => {
    if (filter === 'All') return true;
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Tracking</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Track your job applications, tailor resumes per job, review email drafts, and manage status.
        </p>
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
                            <option value="pending">Pending</option>
                            <option value="waiting_for_review">Waiting Review</option>
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
                        {/* Dedicated Tailor & Draft Button: reads job, tailors resume, writes mail */}
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

                        <button
                          type="button"
                          onClick={() => setSelectedApp(app)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3 h-3" /> Details
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
    </div>
  );
};
