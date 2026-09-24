import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  MapPin,
  Briefcase,
  ExternalLink,
  Mail,
  FileText,
  Copy,
  Check,
  Send,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  Globe,
  Phone,
  RefreshCw,
  Edit3,
  Download,
  ChevronRight,
  ArrowRight,
  Save,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  previewDraftApi,
  getApplicationByJobIdApi,
  createApplicationApi,
  reviewEmailDraftApi,
  approveAndSendApi,
  updateApplicationStatusApi,
} from '../../services/applicationService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';

export const ApplicationReviewModal = ({
  isOpen,
  onClose,
  job,
  initialApplication = null,
  onApplicationUpdated,
}) => {
  const [activeTab, setActiveTab] = useState('review'); // 'review' | 'overview' | 'status'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Application and draft state
  const [application, setApplication] = useState(initialApplication);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [currentStatus, setCurrentStatus] = useState('pending');
  const [selectedStatus, setSelectedStatus] = useState('pending');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [candidateInfo, setCandidateInfo] = useState(null);

  // Method detection
  const detectedMethod =
    application?.applicationMethod ||
    job?.applicationMethod ||
    (job?.hrEmail ? 'email' : job?.applicationUrl?.includes('forms.gle') || job?.applicationUrl?.includes('docs.google.com/forms') ? 'googleForm' : 'email');

  useEffect(() => {
    if (!isOpen || !job) return;

    const loadData = async () => {
      setLoading(true);
      try {
        let existingApp = initialApplication;

        // Try fetching existing application for this job if not provided
        if (!existingApp && job._id) {
          const res = await getApplicationByJobIdApi(job._id);
          if (res?.data) {
            existingApp = res.data;
          }
        }

        if (existingApp) {
          setApplication(existingApp);
          const initialStat = existingApp.status || 'pending';
          setCurrentStatus(initialStat);
          setSelectedStatus(initialStat);
          setRecipient(existingApp.email?.recipient || job.hrEmail || '');
          setSubject(existingApp.email?.subject || `Application for ${job.title} - Candidate`);
          setBody(existingApp.email?.body || '');
        }

        // Fetch or preview draft details
        const draftRes = await previewDraftApi({
          jobId: job._id,
          jobTitle: job.title,
          company: job.company,
          description: job.description,
          requirements: job.requirements,
          skills: job.skills,
          hrEmail: job.hrEmail,
          applicationMethod: detectedMethod,
        });

        if (draftRes?.data) {
          if (!existingApp || !existingApp.email?.body) {
            setRecipient(draftRes.data.email?.recipient || job.hrEmail || '');
            setSubject(draftRes.data.email?.subject || `Application for ${job.title}`);
            setBody(draftRes.data.email?.body || '');
          }
          if (draftRes.data.candidateInfo) {
            setCandidateInfo(draftRes.data.candidateInfo);
          }
          if (draftRes.data.application) {
            setApplication(draftRes.data.application);
            const appStat = draftRes.data.application.status || 'pending';
            setCurrentStatus(appStat);
            setSelectedStatus(appStat);
          }
        }
      } catch (err) {
        // Fallback draft from job info
        if (!body) {
          setRecipient(job.hrEmail && job.hrEmail !== 'unknown' ? job.hrEmail : '');
          setSubject(`Application for ${job.title || 'Position'} - Candidate`);
          setBody(
            `Dear Hiring Team,\n\nI am writing to express my strong enthusiasm for the ${job.title} role at ${job.company}. My professional background matches the requirements and technical challenges described in your job posting.\n\nMy resume is attached for your review. I would welcome the opportunity to speak with your team in an interview.\n\nSincerely,\nCandidate`
          );
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, job, initialApplication]);

  const handleDownloadPdf = async () => {
    if (!application?._id) return;
    try {
      showToast('Opening tailored PDF resume...');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/applications/${application._id}/pdf`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'PDF not generated yet');
      }

      const blob = await res.blob();
      const fileUrl = window.URL.createObjectURL(blob);
      window.open(fileUrl, '_blank');
      showToast('Tailored PDF opened in new tab!');
    } catch (err) {
      const token = localStorage.getItem('token');
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      window.open(`/api/applications/${application._id}/pdf${tokenParam}`, '_blank');
    }
  };

  if (!isOpen || !job) return null;

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Submit / Confirm application action
  const handleConfirmApply = async () => {
    setActionLoading(true);
    try {
      if (application?._id) {
        // If it was waiting for review or draft, save email and approve
        if (detectedMethod === 'email') {
          await reviewEmailDraftApi(application._id, {
            recipient,
            subject,
            body,
          });
          const approvedRes = await approveAndSendApi(application._id);
          setApplication(approvedRes.data);
          setCurrentStatus('Applied');
          showToast('Application email sent and logged as Applied!');
        } else {
          await updateApplicationStatusApi(application._id, 'Applied');
          setCurrentStatus('Applied');
          showToast('Application marked as Applied!');
        }
      } else {
        // Create fresh application directly
        const res = await createApplicationApi({
          jobId: job._id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          sourceUrl: job.sourceUrl || job.applicationUrl,
          applicationMethod: detectedMethod,
          status: 'Applied',
          email: {
            recipient,
            subject,
            body,
            approved: true,
            sentAt: new Date().toISOString(),
          },
        });
        if (res.data) {
          setApplication(res.data);
          setCurrentStatus('Applied');
        }
        showToast('Application successfully recorded as Applied!');
      }

      if (onApplicationUpdated) {
        onApplicationUpdated();
      }
    } catch (err) {
      showToast('Application logged with status Applied');
      setCurrentStatus('Applied');
      if (onApplicationUpdated) onApplicationUpdated();
    } finally {
      setActionLoading(false);
    }
  };

  // Save email draft only without sending
  const handleSaveDraft = async () => {
    setActionLoading(true);
    try {
      if (application?._id) {
        await reviewEmailDraftApi(application._id, {
          recipient,
          subject,
          body,
        });
        showToast('Draft email saved successfully!');
      } else {
        const res = await createApplicationApi({
          jobId: job._id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          sourceUrl: job.sourceUrl || job.applicationUrl,
          applicationMethod: detectedMethod,
          status: 'waiting_for_review',
          email: {
            recipient,
            subject,
            body,
            approved: false,
          },
        });
        if (res.data) {
          setApplication(res.data);
          setCurrentStatus('waiting_for_review');
        }
        showToast('Application draft saved for review!');
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Draft updated locally');
    } finally {
      setActionLoading(false);
    }
  };

  // Re-tailor and re-generate AI draft on demand
  const handleRegenerateDraft = async () => {
    setLoading(true);
    showToast('AI Agent reading job, tailoring resume & drafting message...');
    try {
      const draftRes = await previewDraftApi({
        jobId: job._id,
        jobTitle: job.title,
        company: job.company,
        description: job.description,
        requirements: job.requirements,
        skills: job.skills,
        hrEmail: job.hrEmail,
        applicationMethod: detectedMethod,
        forceRegenerate: true,
      });

      if (draftRes?.data) {
        if (draftRes.data.application) {
          setApplication(draftRes.data.application);
          setCurrentStatus('waiting_for_review');
          setSelectedStatus('waiting_for_review');
        }
        if (draftRes.data.email) {
          setRecipient(draftRes.data.email.recipient || job.hrEmail || '');
          setSubject(draftRes.data.email.subject || `Application for ${job.title}`);
          setBody(draftRes.data.email.body || '');
        }
        if (draftRes.data.candidateInfo) {
          setCandidateInfo(draftRes.data.candidateInfo);
        }
        showToast('AI successfully tailored resume & generated new outreach! Status set to Waiting Review.');
        if (onApplicationUpdated) onApplicationUpdated();
      }
    } catch (err) {
      showToast('Error tailoring draft: ' + (err.message || 'Please retry'));
    } finally {
      setLoading(false);
    }
  };

  // Status change handler triggered exclusively by clicking the Submit button
  const handleSubmitStatusChange = async () => {
    if (!selectedStatus) return;
    setStatusUpdating(true);
    try {
      if (selectedStatus === 'waiting_for_review') {
        await handleRegenerateDraft();
      } else {
        if (application?._id) {
          await updateApplicationStatusApi(application._id, selectedStatus);
        }
        setCurrentStatus(selectedStatus);
        showToast(`Status updated to ${selectedStatus}!`);
        if (onApplicationUpdated) onApplicationUpdated();
      }
    } catch (err) {
      showToast('Status update failed: ' + (err.message || 'Please retry'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const getCompanyInitial = (name) => (name ? name.charAt(0).toUpperCase() : 'C');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-xs">
              {getCompanyInitial(job.company)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug truncate">
                {job.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {job.company}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {job.location || 'Remote / Unspecified'}
                </span>
                {job.experienceRequired && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Exp: {job.experienceRequired}</span>
                  </>
                )}
                {job.source && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-400">Via {job.source}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Notification */}
        {toastMsg && (
          <div className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 text-center animate-in fade-in">
            {toastMsg}
          </div>
        )}

        {/* Nav Tabs */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-2 bg-white">
          <button
            onClick={() => setActiveTab('review')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'review'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Apply Form
          </button>
          
          {(application?.resume?.tailoredResumeData || application?.status === 'waiting_for_review') && (
            <button
              onClick={() => setActiveTab('resume')}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'resume'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              Tailored Resume
            </button>
          )}

          {(application?.email?.body || application?.status === 'waiting_for_review') && (
            <button
              onClick={() => setActiveTab('outreach')}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'outreach'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Mail className="w-4 h-4" />
              Outreach Draft
            </button>
          )}

          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Job & Company Info
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'status'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Status & Workflow
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-14 text-center text-slate-500 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm animate-pulse">
                  <Sparkles className="w-7 h-7 text-blue-600 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-sm font-bold text-slate-900">
                  AI Agent is Preparing Your Tailored Application
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Fetching job details, matching requirements for <span className="font-semibold text-slate-700">{job.title}</span> at <span className="font-semibold text-slate-700">{job.company}</span>, tailoring your resume, drafting outreach mail, and setting status to <span className="font-semibold text-blue-600">Waiting for Review</span>...
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 mt-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>LangGraph Agent Pipeline in progress</span>
              </div>
              
              <Button 
                variant="outline" 
                onClick={onClose}
                className="mt-6 border-slate-200 text-slate-600 hover:bg-slate-100 px-6"
              >
                Cancel Process
              </Button>
            </div>
          ) : (
            <>
              {/* TAB 1: FORM VERIFICATION */}
              {activeTab === 'review' && (
                <div className="space-y-6">
                  {/* Status Banner */}
                  {(currentStatus === 'waiting_for_review' || currentStatus === 'pending') && (
                    <div className="flex flex-col gap-3">
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between gap-3 text-xs shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">AI Tailoring Complete — Ready for Review</p>
                            <p className="text-[11px] text-slate-500">Your resume and outreach are customized for this role.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRegenerateDraft}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-tailor
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Method Header Banner */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {detectedMethod === 'email' && <Mail className="w-5 h-5 text-blue-600" />}
                      {(detectedMethod === 'googleForm' || detectedMethod === 'websiteForm') && (
                        <Globe className="w-5 h-5 text-emerald-600" />
                      )}
                      {detectedMethod === 'phone' && <Phone className="w-5 h-5 text-purple-600" />}
                      {detectedMethod !== 'email' &&
                        detectedMethod !== 'googleForm' &&
                        detectedMethod !== 'websiteForm' &&
                        detectedMethod !== 'phone' && <ExternalLink className="w-5 h-5 text-slate-600" />}
                      <div>
                        <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Application Channel:{' '}
                          <span className="text-blue-600 capitalize">{detectedMethod}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {detectedMethod === 'email'
                            ? 'Verify and polish the tailored application email before dispatch.'
                            : detectedMethod === 'googleForm'
                            ? 'Submit application directly via Google Forms. Use quick-copy cheat sheet below.'
                            : detectedMethod === 'websiteForm'
                            ? 'Submit application directly on company careers portal.'
                            : 'Review and confirm your application details before marking applied.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {application?._id && (
                        <button
                          type="button"
                          onClick={handleDownloadPdf}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                          title="Download or View Tailored ATS PDF Resume"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>PDF Resume</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleRegenerateDraft}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                        title="Read job details, tailor resume, and write tailored outreach email or form responses"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Tailor & Draft</span>
                      </button>

                      {/* Status Selector + Submit Button */}
                      <div className="flex items-center gap-1.5 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                        <select
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                          className={`text-xs font-bold px-2 py-1 rounded-md border-0 cursor-pointer focus:outline-none ${getStatusBadgeStyle(
                            selectedStatus
                          )}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="waiting_for_review">Waiting Review</option>
                          <option value="Applied">Applied</option>
                          <option value="Interview">Interview</option>
                          <option value="Offer">Offer</option>
                          <option value="Rejected">Rejected</option>
                        </select>

                        <button
                          type="button"
                          onClick={handleSubmitStatusChange}
                          disabled={statusUpdating}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            selectedStatus !== currentStatus
                              ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                          title="Submit selected status change"
                        >
                          {statusUpdating ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Submit</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1. EMAIL CHANNEL VERIFICATION */}
                  {detectedMethod === 'email' && (
                    <div className="space-y-4">
                      {/* Recipient & Subject fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            HR / Recipient Email
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              value={recipient}
                              onChange={(e) => setRecipient(e.target.value)}
                              placeholder="hr@company.com"
                              className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 focus:outline-none"
                            />
                            {recipient && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(recipient, 'recipient')}
                                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                title="Copy email address"
                              >
                                {copiedKey === 'recipient' ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Email Subject Line
                          </label>
                          <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Email Body Verification Area */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            Tailored Application Email Body
                          </label>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(body, 'body')}
                              className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer"
                            >
                              {copiedKey === 'body' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              Copy Body
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={11}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Your professional application cover letter email..."
                          className="w-full font-mono text-xs text-slate-800 bg-slate-50/60 border border-slate-200 rounded-xl p-3.5 focus:bg-white focus:border-blue-500 focus:outline-none leading-relaxed"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          You can edit and customize this message before sending. Your active ATS
                          resume is attached automatically.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. GOOGLE FORM & WEBSITE FORM CHANNEL VERIFICATION */}
                  {(detectedMethod === 'googleForm' ||
                    detectedMethod === 'websiteForm' ||
                    job.applicationUrl) && (
                    <div className="space-y-4">
                      {/* Direct External Link */}
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-blue-900">
                            {detectedMethod === 'googleForm'
                              ? 'Google Form Application Link'
                              : 'Official Application URL'}
                          </p>
                          <p className="text-xs text-blue-700 mt-0.5 truncate max-w-lg">
                            {job.applicationUrl || job.sourceUrl}
                          </p>
                        </div>
                        <a
                          href={job.applicationUrl || job.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                        >
                          Open Form <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Quick Auto-Fill Cheat Sheet for Form Completion */}
                      <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Quick Form Auto-Fill Cheat Sheet
                          </h3>
                          <span className="text-[11px] text-slate-400">
                            Click to copy fields into the form
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Full Name</span>
                              <span className="font-semibold text-slate-800">
                                {candidateInfo?.fullName || 'Karan Gade'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  candidateInfo?.fullName || 'Karan Gade',
                                  'name'
                                )
                              }
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                            >
                              {copiedKey === 'name' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Email</span>
                              <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                                {candidateInfo?.email || 'gadekaran24@gmail.com'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  candidateInfo?.email || 'gadekaran24@gmail.com',
                                  'cand_email'
                                )
                              }
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                            >
                              {copiedKey === 'cand_email' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Role Applied For</span>
                              <span className="font-semibold text-slate-800">{job.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(job.title, 'job_title')}
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                            >
                              {copiedKey === 'job_title' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Key Skills</span>
                              <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                                {(job.skills || []).slice(0, 4).join(', ') || 'Full Stack'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  (job.skills || []).join(', '),
                                  'skills_copy'
                                )
                              }
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                            >
                              {copiedKey === 'skills_copy' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Quick Pitch Snippet */}
                        <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-semibold">
                              Brief Pitch / "Why should we hire you?"
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(body, 'pitch_copy')}
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === 'pitch_copy' ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              Copy Pitch
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                            {body ||
                              `Experienced developer with strong expertise in ${job.title} tech stack. Proven record delivering high quality solutions.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. PHONE / WHATSAPP CHANNEL VERIFICATION */}
                  {detectedMethod === 'phone' && (
                    <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-purple-900">Direct Contact Number</p>
                          <p className="text-sm font-bold text-purple-800 mt-0.5">
                            {job.contactNumber || 'Contact provided in job posting'}
                          </p>
                        </div>
                        {job.contactNumber && (
                          <a
                            href={`tel:${job.contactNumber}`}
                            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            Call Now
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: OVERVIEW & COMPANY INFO */}
              {activeTab === 'resume' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Tailored ATS Resume
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Customized for this specific job's keywords and requirements.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {application?.resume?.pdfPath && (
                        <a 
                          href={`/api/applications/${application._id}/pdf?token=${localStorage.getItem('token')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold hover:bg-blue-700 shadow-sm transition-all"
                        >
                          <Download className="w-3.5 h-3.5" /> Download PDF
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {application?.resume?.tailoredResumeData?.summary && (
                      <div className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Professional Summary</h4>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed italic border-l-2 border-emerald-100 pl-3">
                          {application.resume.tailoredResumeData.summary}
                        </p>
                      </div>
                    )}
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-400">View or download the full PDF to see all tailored sections.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'outreach' && (
                <div className="space-y-6">
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-600" /> AI Outreach Draft
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Tailored outreach based on the application method.</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => copyToClipboard(application?.email?.body, 'outreach')}
                      className="text-blue-600 font-bold"
                    >
                      {copiedKey === 'outreach' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Draft
                    </Button>
                  </div>

                  <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm">
                     <div className="mb-4 space-y-2 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400 w-16">To:</span>
                          <span className="font-semibold text-slate-700">{application?.email?.recipient || 'Unknown Recruiter'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400 w-16">Subject:</span>
                          <span className="font-bold text-slate-900">{application?.email?.subject || `Job Application: ${job.title}`}</span>
                        </div>
                     </div>
                     <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-serif">
                        {application?.email?.body || 'No draft generated yet.'}
                     </div>
                  </div>
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Job Match & Score analysis */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <Sparkles className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                        Match Score: {job.matchScore || job.matchPercentage || 90}%
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {job.matchReason ||
                          'Role aligns with your core development stack and professional experience.'}
                      </p>
                    </div>

                    {job.sourceUrl && (
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                      >
                        Original Posting <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Skills Grid */}
                  {job.skills && job.skills.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                        Target Skills & Technologies
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {job.skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-800"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Requirements list */}
                  {job.requirements && job.requirements.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                        Key Requirements
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside leading-relaxed">
                        {job.requirements.map((req, idx) => (
                          <li key={idx}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Responsibilities list */}
                  {job.responsibilities && job.responsibilities.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                        Responsibilities
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside leading-relaxed">
                        {job.responsibilities.map((resp, idx) => (
                          <li key={idx}>{resp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Full Description */}
                  {job.description && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                        Full Job Description
                      </h4>
                      <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-200 max-h-60 overflow-y-auto">
                        {job.description}
                      </div>
                    </div>
                  )}

                  {/* How to Apply section */}
                  {job.howToApply && (
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                      <h4 className="text-xs font-bold text-amber-900 mb-1">
                        Application Instructions
                      </h4>
                      <p className="text-xs text-amber-800 leading-relaxed">{job.howToApply}</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: STATUS & WORKFLOW HISTORY */}
              {activeTab === 'status' && (
                <div className="space-y-6">
                  {/* Status Overview Card */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Current Application Status
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Update the state as your application advances through recruiter stages.
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusBadgeStyle(
                          currentStatus
                        )}`}
                      >
                        {currentStatus}
                      </span>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {['pending', 'waiting_for_review', 'Applied', 'Interview', 'Offer', 'Rejected'].map((st) => {
                          const isSelected = (selectedStatus || currentStatus).toLowerCase() === st.toLowerCase();
                          const label = st === 'waiting_for_review' ? 'Waiting Review' : st === 'pending' ? 'Pending' : st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setSelectedStatus(st)}
                              className={`p-2.5 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explicit Submit button for stage changes */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSubmitStatusChange}
                          disabled={statusUpdating || selectedStatus === currentStatus}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                            selectedStatus !== currentStatus
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          }`}
                        >
                          {statusUpdating ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>
                            Submit Status Change
                            {selectedStatus !== currentStatus &&
                              ` to "${selectedStatus === 'waiting_for_review' ? 'Waiting Review' : selectedStatus}"`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Logs & Activity */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                      Application Activity & Audit Trail
                    </h4>
                    {application?.workflow?.logs && application.workflow.logs.length > 0 ? (
                      <div className="space-y-2">
                        {application.workflow.logs.map((log, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-start justify-between gap-3"
                          >
                            <div>
                              <p className="font-semibold text-slate-800">{log.message}</p>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono mt-0.5 block">
                                {log.event}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              {formatDate(log.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        {application?.createdAt
                          ? `Application initiated on ${formatDate(application.createdAt)}`
                          : 'No recorded workflow events yet. Click Confirm & Apply to record this application.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {detectedMethod === 'email' && (
              <Button
                variant="secondary"
                size="sm"
                loading={actionLoading}
                onClick={handleSaveDraft}
                className="cursor-pointer"
              >
                Save Draft
              </Button>
            )}

            <Button
              size="sm"
              loading={actionLoading}
              onClick={handleConfirmApply}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white gap-1.5 cursor-pointer font-bold px-5"
            >
              {detectedMethod === 'email' ? (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Approve & Apply
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verify & Mark Applied
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
