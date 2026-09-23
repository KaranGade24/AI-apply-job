import React, { useState, useEffect } from 'react';
import { MoreVertical, ExternalLink, Eye } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ApplicationReviewModal } from './ApplicationReviewModal';
import { getApplicationsApi, updateApplicationStatusApi } from '../../services/applicationService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);

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

  const handleStatusChange = async (appId, newStatus) => {
    try {
      await updateApplicationStatusApi(appId, newStatus);
      setApplications((prev) =>
        prev.map((a) => (a._id === appId ? { ...a, status: newStatus } : a))
      );
    } catch (err) {
      // Fallback local update
      setApplications((prev) =>
        prev.map((a) => (a._id === appId ? { ...a, status: newStatus } : a))
      );
    }
  };

  const counts = {
    All: applications.length,
    Applied: applications.filter((a) => a.status === 'Applied').length,
    Interview: applications.filter((a) => a.status === 'Interview').length,
    Offer: applications.filter((a) => a.status === 'Offer').length,
    Rejected: applications.filter((a) => a.status === 'Rejected').length,
  };

  const filteredApps = applications.filter((a) => {
    if (filter === 'All') return true;
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Tracking</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Track your job applications and their status.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {['All', 'Applied', 'Interview', 'Offer', 'Rejected'].map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setFilter(tabKey)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              filter === tabKey
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tabKey} ({counts[tabKey] || 0})
          </button>
        ))}
      </div>

      {/* Applications Table Card */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Job Title</th>
                <th className="py-3.5 px-6">Company</th>
                <th className="py-3.5 px-6">Location</th>
                <th className="py-3.5 px-6">Applied Date</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    Loading applications...
                  </td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    No applications found for selected status.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const title = app.jobTitle || app.jobId?.title || 'Position';
                  const company = app.company || app.jobId?.company || 'Company';
                  const location = app.location || app.jobId?.location || 'Remote';
                  const sourceUrl = app.sourceUrl || app.jobId?.sourceUrl || '';
                  const appliedDate = app.appliedDate || app.createdAt;

                  return (
                    <tr
                      key={app._id}
                      onClick={() => setSelectedApp(app)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* Job Title */}
                      <td className="py-4 px-6 font-semibold text-slate-900 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${getLogoColor(company)} text-white font-bold text-xs flex items-center justify-center shrink-0`}>
                          {getLogoInitial(company)}
                        </div>
                        <span className="truncate max-w-xs">{title}</span>
                      </td>

                      {/* Company */}
                      <td className="py-4 px-6 text-slate-600 font-medium">{company}</td>

                      {/* Location */}
                      <td className="py-4 px-6 text-slate-500">{location}</td>

                      {/* Applied Date */}
                      <td className="py-4 px-6 text-slate-500 tabular-nums">{formatDate(appliedDate)}</td>

                      {/* Status Badge */}
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={app.status || 'Applied'}
                          onChange={(e) => handleStatusChange(app._id, e.target.value)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md border cursor-pointer ${getStatusBadgeStyle(app.status)}`}
                        >
                          <option value="Applied">Applied</option>
                          <option value="pending">Pending</option>
                          <option value="waiting_for_review">Review</option>
                          <option value="sent">Sent</option>
                          <option value="Interview">Interview</option>
                          <option value="Offer">Offer</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedApp(app)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" /> Details
                        </button>
                        {sourceUrl && (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Link <ExternalLink className="w-3 h-3" />
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
