import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Bot,
  Terminal,
  Search,
  Sparkles,
  Sliders,
  HelpCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  getQueueApi,
  pauseQueueApi,
  resumeQueueApi,
  retryQueueItemApi,
  skipQueueItemApi,
  cancelQueueItemApi,
  retryAllFailedApi,
  clearCompletedQueueApi,
} from '../../services/queueService';
import { ApplicationReviewModal } from '../applications/ApplicationReviewModal';
import { getApplicationByIdApi } from '../../services/applicationService';

export const AutomationPage = () => {
  const navigate = useNavigate();
  const [queueItems, setQueueItems] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    analyzing: 0,
    waitingForUser: 0,
    submitting: 0,
    submitted: 0,
    failed: 0,
    skipped: 0,
    needsReview: 0,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Review / Interactive browser modal state
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadQueue = async () => {
    try {
      setLoading(true);
      const res = await getQueueApi();
      if (res?.data) {
        setQueueItems(res.data);
        if (res.stats) setStats(res.stats);
        if (res.isPaused !== undefined) setIsPaused(res.isPaused);
      }
    } catch (err) {
      showToast('Failed to load automation queue: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePause = async () => {
    setActionLoading(true);
    try {
      if (isPaused) {
        await resumeQueueApi();
        setIsPaused(false);
        showToast('Automation queue resumed.', 'success');
      } else {
        await pauseQueueApi();
        setIsPaused(true);
        showToast('Automation queue paused.', 'info');
      }
      loadQueue();
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryItem = async (id) => {
    try {
      await retryQueueItemApi(id);
      showToast('Job queued for retry.', 'success');
      loadQueue();
    } catch (err) {
      showToast('Retry failed: ' + err.message, 'error');
    }
  };

  const handleSkipItem = async (id) => {
    try {
      await skipQueueItemApi(id);
      showToast('Job skipped.', 'info');
      loadQueue();
    } catch (err) {
      showToast('Skip failed: ' + err.message, 'error');
    }
  };

  const handleCancelItem = async (id) => {
    try {
      await cancelQueueItemApi(id);
      showToast('Job removed from automation queue.', 'info');
      loadQueue();
    } catch (err) {
      showToast('Cancel failed: ' + err.message, 'error');
    }
  };

  const handleRetryAllFailed = async () => {
    setActionLoading(true);
    try {
      const res = await retryAllFailedApi();
      showToast(`Retrying ${res?.data?.modifiedCount || 0} failed job(s).`, 'success');
      loadQueue();
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearCompleted = async () => {
    setActionLoading(true);
    try {
      const res = await clearCompletedQueueApi();
      showToast(`Cleared ${res?.data?.deletedCount || 0} finished job(s).`, 'success');
      loadQueue();
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReview = async (appId) => {
    if (!appId) return;
    try {
      const res = await getApplicationByIdApi(appId);
      if (res?.data) {
        setSelectedApplication(res.data);
        setIsModalOpen(true);
      }
    } catch (err) {
      showToast('Could not load application details: ' + err.message, 'error');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Submitted
        </span>;
      case 'WAITING_FOR_USER':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Action Required
        </span>;
      case 'ANALYZING':
      case 'DEEP_DIVING':
      case 'PREPARING':
      case 'FILLING':
      case 'SUBMITTING':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
          <Bot className="w-3.5 h-3.5 text-blue-600" /> {status.replace('_', ' ')}
        </span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Failed
        </span>;
      case 'SKIPPED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          Skipped
        </span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-slate-500" /> Pending
        </span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 border transition-all ${
          toast.type === 'error'
            ? 'bg-rose-900 text-white border-rose-800'
            : toast.type === 'success'
            ? 'bg-emerald-900 text-white border-emerald-800'
            : 'bg-slate-900 text-white border-slate-800'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header & Global Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-blue-600" />
            Automated Application Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Section 16 & 17 — Multi-job orchestrator with human oversight, automated deep-dive, and state tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            size="sm"
            variant={isPaused ? 'default' : 'outline'}
            onClick={handleTogglePause}
            loading={actionLoading}
            className="text-xs font-semibold cursor-pointer gap-1.5"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            {isPaused ? 'Resume Queue' : 'Pause Queue'}
          </Button>

          {stats.failed > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryAllFailed}
              loading={actionLoading}
              className="text-xs font-semibold cursor-pointer text-amber-700 hover:text-amber-800 hover:bg-amber-50"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry Failed ({stats.failed})
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleClearCompleted}
            loading={actionLoading}
            className="text-xs font-semibold cursor-pointer text-slate-600 hover:text-slate-800"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Completed
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/jobs')}
            className="text-xs font-semibold cursor-pointer bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            <Search className="w-3.5 h-3.5" /> Enqueue More Jobs
          </Button>
        </div>
      </div>

      {/* Queue Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3.5 bg-white border-slate-200">
          <div className="text-xs font-medium text-slate-500">Total Queued</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
        </Card>
        <Card className="p-3.5 bg-white border-slate-200">
          <div className="text-xs font-medium text-blue-600">In Progress</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{stats.analyzing + stats.preparing + stats.filling}</div>
        </Card>
        <Card className="p-3.5 bg-white border-amber-200 bg-amber-50/20">
          <div className="text-xs font-medium text-amber-700">Waiting for User</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{stats.waitingForUser}</div>
        </Card>
        <Card className="p-3.5 bg-white border-slate-200">
          <div className="text-xs font-medium text-slate-500">Pending</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{stats.pending}</div>
        </Card>
        <Card className="p-3.5 bg-white border-emerald-200 bg-emerald-50/20">
          <div className="text-xs font-medium text-emerald-700">Submitted</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.submitted}</div>
        </Card>
        <Card className="p-3.5 bg-white border-rose-200 bg-rose-50/20">
          <div className="text-xs font-medium text-rose-700">Failed / Blocked</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{stats.failed}</div>
        </Card>
      </div>

      {/* Active Queue Runner State Banner */}
      {isPaused && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-900 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Pause className="w-4 h-4 text-amber-700 shrink-0" />
            <span>The automation queue is currently paused. New applications will not be processed automatically.</span>
          </div>
          <button
            type="button"
            onClick={handleTogglePause}
            className="text-xs font-bold underline hover:text-amber-950 cursor-pointer"
          >
            Resume Now
          </button>
        </div>
      )}

      {/* Queue Items List */}
      {queueItems.length === 0 && !loading ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Terminal className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Your Automation Queue is Empty</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            Discover matching jobs on LinkedIn, Indeed, or Naukri, then select multiple jobs to batch-automate their application workflow.
          </p>
          <Button
            onClick={() => navigate('/jobs')}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 mr-1.5" /> Find & Enqueue Jobs
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {queueItems.map((item, idx) => {
            const job = item.jobId;
            const app = item.applicationId;
            return (
              <Card
                key={item._id}
                className="p-5 border-slate-200 hover:border-slate-300 transition-all bg-white shadow-xs"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Job Meta */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-400">#{idx + 1}</span>
                      <span>{job?.source || 'Career Portal'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job?.location || 'Location Not Specified'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job?.workMode || 'Full-Time'}</span>
                      {job?.matchScore ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-blue-600">{job.matchScore}% Match</span>
                        </>
                      ) : null}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {job?.title || 'Job Application'}
                    </h3>
                    <p className="text-xs font-medium text-slate-600">
                      {job?.company || 'Company'}
                    </p>

                    {/* Progress Bar & Current Step */}
                    <div className="pt-2 max-w-md">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-medium text-slate-700">{item.currentStep}</span>
                        <span>{item.progressPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            item.status === 'SUBMITTED'
                              ? 'bg-emerald-500'
                              : item.status === 'FAILED'
                              ? 'bg-rose-500'
                              : item.status === 'WAITING_FOR_USER'
                              ? 'bg-amber-500'
                              : 'bg-blue-600'
                          }`}
                          style={{ width: `${item.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Missing Info Warning Callout */}
                    {item.status === 'WAITING_FOR_USER' && (
                      <div className="mt-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold">Human Action Required: </span>
                          <span>
                            {item.missingInfoRequired?.questionText ||
                              item.errorReason ||
                              'Portal requires user input or manual verification.'}
                          </span>
                        </div>
                        {app && (
                          <button
                            type="button"
                            onClick={() => handleOpenReview(app._id)}
                            className="font-bold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
                          >
                            Answer / Solve Now
                          </button>
                        )}
                      </div>
                    )}

                    {/* Failure Reason */}
                    {item.status === 'FAILED' && item.errorReason && (
                      <div className="mt-2 text-xs text-rose-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.errorReason}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-start md:self-center shrink-0">
                    <div>{getStatusBadge(item.status)}</div>

                    <div className="flex items-center gap-1.5">
                      {app && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleOpenReview(app._id)}
                          className="text-xs font-semibold cursor-pointer"
                        >
                          Review & Live Browser
                        </Button>
                      )}

                      {item.status === 'FAILED' && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleRetryItem(item._id)}
                          className="text-xs font-semibold cursor-pointer text-amber-700 hover:text-amber-800"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      )}

                      {['PENDING', 'ANALYZING', 'WAITING_FOR_USER'].includes(item.status) && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleSkipItem(item._id)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                          Skip
                        </Button>
                      )}

                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleCancelItem(item._id)}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review & Live Browser Modal */}
      {isModalOpen && selectedApplication && (
        <ApplicationReviewModal
          isOpen={isModalOpen}
          application={selectedApplication}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedApplication(null);
            loadQueue();
          }}
          onApplicationUpdated={loadQueue}
        />
      )}
    </div>
  );
};

export default AutomationPage;
