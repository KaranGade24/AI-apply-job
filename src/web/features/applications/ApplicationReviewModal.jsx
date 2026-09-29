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
  AlertTriangle,
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
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  previewDraftApi,
  getApplicationDetailsApi,
  getApplicationByJobIdApi,
  createApplicationApi,
  reviewEmailDraftApi,
  approveAndSendApi,
  updateApplicationStatusApi,
  submitMissingAnswersApi,
  confirmFinalApplicationApi,
  saveEditedAnswersApi,
  refillApplicationFormApi,
  analyzePortalApi,
  advancePortalActionApi,
  tailorRoleOutreachApi,
  sendDirectRoleEmailApi,
  applySelectedRolesBatchApi,
  retryGoogleFormApi,
} from '../../services/applicationService';
import { GoogleSessionModal } from '../google/GoogleSessionModal';
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
  const [toastType, setToastType] = useState('info'); // 'info' | 'success' | 'error'
  const [actionError, setActionError] = useState('');

  // Application and draft state
  const [application, setApplication] = useState(initialApplication);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [currentStatus, setCurrentStatus] = useState('Pending');
  const [selectedStatus, setSelectedStatus] = useState('Pending');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [missingAnswers, setMissingAnswers] = useState({});
  const [reviewAnswers, setReviewAnswers] = useState({});
  const [analyzingPortal, setAnalyzingPortal] = useState(false);
  const [advancingPortal, setAdvancingPortal] = useState(false);
  const [refillingForm, setRefillingForm] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [retryingGoogleForm, setRetryingGoogleForm] = useState(false);
  const [formQuestionFilter, setFormQuestionFilter] = useState('all'); // 'all' | 'filled' | 'missing' | 'required'
  const [formSearchQuery, setFormSearchQuery] = useState('');
  const [showPasswords, setShowPasswords] = useState({});

  // Multi-role & Direct Email Outreach state
  const [tailoringRoleId, setTailoringRoleId] = useState(null);
  const [sendingDirectEmail, setSendingDirectEmail] = useState(false);
  const [selectedRolesBatch, setSelectedRolesBatch] = useState([]);
  const [activeRoleDraft, setActiveRoleDraft] = useState(null);
  const [roleDraftModalOpen, setRoleDraftModalOpen] = useState(false);
  const [batchApplying, setBatchApplying] = useState(false);
  const [selectedOpeningFilter, setSelectedOpeningFilter] = useState('');

  // Method & source detection
  const isNaukriSource = job?.source === 'naukri';
  const rawMethod = (application?.applicationMethod || job?.applicationMethod || '').toLowerCase();
  const isCompanySite =
    rawMethod === 'company_site' ||
    job?.applyButtonSelector === '#company-site-button' ||
    (isNaukriSource && (rawMethod.includes('company') || rawMethod.includes('external')));
  
  const isNaukriDirect =
    (isNaukriSource && !isCompanySite) ||
    rawMethod === 'naukri_direct' ||
    rawMethod === 'naukri' ||
    job?.applyButtonSelector === '#apply-button';

  const isNaukri = isNaukriDirect || isCompanySite || isNaukriSource;

  const detectedMethod = isNaukriDirect
    ? 'naukri_direct'
    : isCompanySite
    ? 'company_site'
    : application?.applicationMethod ||
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
          const initialStat = existingApp.status || 'Pending';
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
            const appStat = draftRes.data.application.status || 'Pending';
            setCurrentStatus(appStat);
            setSelectedStatus(appStat);

            if (draftRes.data.application.form?.missingQuestions) {
              const initMissing = {};
              draftRes.data.application.form.missingQuestions.forEach((q) => {
                initMissing[q.questionId] = '';
              });
              setMissingAnswers(initMissing);
            }
            if (draftRes.data.application.form?.reviewFields) {
              const initReview = {};
              draftRes.data.application.form.reviewFields.forEach((f) => {
                initReview[f.questionId] = f.answer ?? '';
              });
              setReviewAnswers(initReview);
            }
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

  const showToast = (msg, type = 'info') => {
    let determined = type;
    if (type === 'info') {
      const lower = (msg || '').toLowerCase();
      if (lower.includes('error') || lower.includes('failed') || lower.includes('could not')) {
        determined = 'error';
      } else if (lower.includes('success') || lower.includes('applied') || lower.includes('saved')) {
        determined = 'success';
      }
    }
    setToastMsg(msg);
    setToastType(determined);
    setTimeout(() => {
      setToastMsg('');
      setToastType('info');
    }, 4500);
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isLocked = ['applied', 'sent', 'interview', 'offer', 'rejected'].includes(currentStatus?.toLowerCase());

  // Checkpoint 1: Submit missing answers handler
  const handleSubmitMissingAnswers = async () => {
    if (!application?._id) return;
    setActionLoading(true);
    try {
      const formatted = Object.entries(missingAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await submitMissingAnswersApi(application._id, formatted);
      if (res?.data) {
        setApplication(res.data);
        setCurrentStatus(res.data.status || 'processing');
        setSelectedStatus(res.data.status || 'processing');

        if (res.data.form?.missingQuestions) {
          const initMissing = {};
          res.data.form.missingQuestions.forEach((q) => {
            initMissing[q.questionId] = '';
          });
          setMissingAnswers(initMissing);
        }
        if (res.data.form?.reviewFields) {
          const initReview = {};
          res.data.form.reviewFields.forEach((f) => {
            initReview[f.questionId] = f.answer ?? '';
          });
          setReviewAnswers(initReview);
        }
      }
      showToast('Answers submitted! Resuming application workflow...');
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Error submitting answers: ' + (err.message || 'Please retry'));
    } finally {
      setActionLoading(false);
    }
  };

  // Checkpoint 2: Final confirmation handler
  const handleConfirmFinal = async () => {
    if (!application?._id) return;
    setActionLoading(true);
    try {
      const formatted = Object.entries(reviewAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await confirmFinalApplicationApi(application._id, formatted);
      if (res?.data) {
        setApplication(res.data);
        const newStatus = res.data.status || 'Applied';
        setCurrentStatus(newStatus);
        setSelectedStatus(newStatus);
        if (res.data.form?.reviewFields) {
          const initReview = {};
          res.data.form.reviewFields.forEach((f) => {
            initReview[f.questionId] = f.answer ?? '';
          });
          setReviewAnswers(initReview);
        }
        showToast(
          newStatus.toLowerCase() === 'applied'
            ? (isNaukri ? 'Application verified and submitted successfully on Naukri!' : 'Application verified and submitted successfully on employer portal!')
            : `Step confirmed! Advanced to Step ${res.data.form?.currentStep || 2}. Review filled fields below.`
        );
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Submission error: ' + (err.message || 'Please retry'));
    } finally {
      setActionLoading(false);
    }
  };

  // Save edited answers without refilling browser
  const handleSaveAnswers = async () => {
    if (!application?._id) return;
    setSavingAnswers(true);
    try {
      const formatted = Object.entries(reviewAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await saveEditedAnswersApi(application._id, formatted);
      if (res?.data) {
        setApplication(res.data);
      }
      showToast('Answers saved successfully!');
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Error saving answers: ' + (err.message || 'Please retry'));
    } finally {
      setSavingAnswers(false);
    }
  };

  // Refill live browser form with updated user answers and re-inspect fields
  const handleRefillForm = async () => {
    if (!application?._id) return;
    setRefillingForm(true);
    try {
      showToast('AI refilling browser form with your updated information and re-verifying...');
      const formatted = Object.entries(reviewAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await refillApplicationFormApi(application._id, formatted);
      if (res?.data) {
        setApplication(res.data);
        if (res.data.form?.reviewFields) {
          const updatedReview = {};
          res.data.form.reviewFields.forEach((f) => {
            updatedReview[f.questionId] = f.answer ?? '';
          });
          setReviewAnswers(updatedReview);
        }
      }
      showToast('Form successfully refilled and re-verified in browser!');
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Refill error: ' + (err.message || 'Please retry'));
    } finally {
      setRefillingForm(false);
    }
  };

  // Retries Google Form filling (e.g. after Google session connected)
  const handleRetryGoogleForm = async () => {
    if (!application?._id) return;
    setRetryingGoogleForm(true);
    try {
      showToast('AI opening Google Form with authenticated session...');
      const res = await retryGoogleFormApi(application._id);
      if (res?.data) {
        setApplication(res.data);
        if (res.data.status) {
          setCurrentStatus(res.data.status);
          setSelectedStatus(res.data.status);
        }
      }
      showToast(res?.message || 'Google Form operation completed!');
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Google Form error: ' + (err.message || 'Please retry'));
    } finally {
      setRetryingGoogleForm(false);
    }
  };

  // AI Portal Intelligence: Analyze rendered employer portal page
  const handleAnalyzePortal = async () => {
    if (!application?._id) return;
    setAnalyzingPortal(true);
    try {
      showToast('Opening employer portal and analyzing rendered page with AI LLM...');
      const res = await analyzePortalApi(application._id);
      if (res?.data) {
        setApplication(res.data);
        if (res.data.status) {
          setCurrentStatus(res.data.status);
          setSelectedStatus(res.data.status);
        }
        showToast(`AI Analysis Complete: ${res.data.pageAnalysis?.summary || 'Rendered page classified'}`);
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Failed to analyze portal: ' + (err.message || 'Please retry'));
    } finally {
      setAnalyzingPortal(false);
    }
  };

  // Advance employer portal action (expand matched or selected role & click inner Apply Now)
  const handleAdvancePortalAction = async (specificRole = null) => {
    if (!application?._id) return;
    setAdvancingPortal(true);
    try {
      showToast(
        specificRole
          ? `AI expanding "${specificRole.title}" & clicking Apply Now in browser...`
          : 'AI expanding matched role & clicking inner Apply Now button in browser...'
      );
      const res = await advancePortalActionApi(application._id, specificRole);
      if (res?.data) {
        setApplication(res.data);
        if (res.data.status) {
          setCurrentStatus(res.data.status);
          setSelectedStatus(res.data.status);
        }
        showToast('Portal action advanced! New page content analyzed.');
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Failed to advance portal action: ' + (err.message || 'Please retry'));
    } finally {
      setAdvancingPortal(false);
    }
  };

  // Generate tailored resume and email draft for a specific opening role
  const handleTailorRoleOutreach = async (role) => {
    if (!application?._id) return;
    const roleTitle = role.title || 'Selected Role';
    setTailoringRoleId(roleTitle);
    try {
      showToast(`Generating tailored resume and email draft for "${roleTitle}"...`);
      const res = await tailorRoleOutreachApi(application._id, {
        roleTitle: role.title,
        referenceId: role.referenceId,
        jobDescription: role.descriptionSnippet || role.title,
        experience: role.experience,
        location: role.location,
        recipientEmail: role.email || application.pageAnalysis?.emailContact?.email,
      });

      if (res?.data) {
        setActiveRoleDraft(res.data);
        setRoleDraftModalOpen(true);
        if (res.data.application) {
          setApplication(res.data.application);
        }
        showToast(`Tailored resume & email generated for ${roleTitle}!`);
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Failed to tailor role: ' + (err.message || 'Please retry'));
    } finally {
      setTailoringRoleId(null);
    }
  };

  // Send direct email for a role with tailored resume PDF attached
  const handleSendRoleDirectEmail = async () => {
    if (!application?._id || !activeRoleDraft) return;
    setSendingDirectEmail(true);
    try {
      showToast(`Sending application email to ${activeRoleDraft.email.recipient}...`);
      const res = await sendDirectRoleEmailApi(application._id, {
        recipient: activeRoleDraft.email.recipient,
        subject: activeRoleDraft.email.subject,
        body: activeRoleDraft.email.body,
        pdfPath: activeRoleDraft.resume?.pdfPath,
        roleTitle: activeRoleDraft.roleTitle,
        referenceId: activeRoleDraft.referenceId,
      });

      if (res?.data) {
        setApplication(res.data);
        setCurrentStatus('Applied');
        setSelectedStatus('Applied');
        setRoleDraftModalOpen(false);
        showToast(`Application successfully emailed to ${activeRoleDraft.email.recipient}!`);
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Failed to send email: ' + (err.message || 'Please retry'));
    } finally {
      setSendingDirectEmail(false);
    }
  };

  // Toggle selection for batch application
  const toggleBatchRole = (role) => {
    const roleId = role.id || role.title;
    setSelectedRolesBatch((prev) => {
      const exists = prev.some((r) => (r.id || r.title) === roleId);
      if (exists) {
        return prev.filter((r) => (r.id || r.title) !== roleId);
      } else {
        return [...prev, role];
      }
    });
  };

  // Batch apply to all selected roles
  const handleBatchApplySelectedRoles = async () => {
    if (!application?._id || selectedRolesBatch.length === 0) return;
    setBatchApplying(true);
    try {
      showToast(`AI generating tailored resumes and processing ${selectedRolesBatch.length} selected roles...`);
      const res = await applySelectedRolesBatchApi(application._id, selectedRolesBatch);
      if (res?.data) {
        showToast(`Successfully prepared tailored applications for ${res.data.processedCount} roles!`);
        setSelectedRolesBatch([]);
      }
      if (onApplicationUpdated) onApplicationUpdated();
    } catch (err) {
      showToast('Batch application error: ' + (err.message || 'Please retry'));
    } finally {
      setBatchApplying(false);
    }
  };

  // Submit / Confirm application action
  const handleConfirmApply = async () => {
    // If on Checkpoint 2 (waiting for final review)
    if (application?.status === 'waiting_for_final_review' || application?.form?.reviewFields?.length > 0) {
      return await handleConfirmFinal();
    }

    // If on Checkpoint 1 (missing answers / credentials required)
    if (application?.status === 'waiting_for_user' || application?.form?.missingQuestions?.length > 0) {
      return await handleSubmitMissingAnswers();
    }

    setActionLoading(true);
    try {
      if (application?._id) {
        // If Naukri 1-Click apply or Company Site Apply, invoke approveAndSendApi which triggers browser automation!
        if (isNaukriDirect || isCompanySite) {
          showToast(
            isCompanySite
              ? 'Opening company portal & executing AI application engine...'
              : 'Starting Naukri 1-Click apply workflow in browser...'
          );
          const approvedRes = await approveAndSendApi(application._id);
          if (approvedRes?.data) {
            setApplication(approvedRes.data);
            const nextStat = approvedRes.data.status || 'processing';
            setCurrentStatus(nextStat);
            setSelectedStatus(nextStat);

            if (approvedRes.data.form?.missingQuestions) {
              const initMissing = {};
              approvedRes.data.form.missingQuestions.forEach((q) => {
                initMissing[q.questionId] = '';
              });
              setMissingAnswers(initMissing);
            }
            if (approvedRes.data.form?.reviewFields) {
              const initReview = {};
              approvedRes.data.form.reviewFields.forEach((f) => {
                initReview[f.questionId] = f.answer ?? '';
              });
              setReviewAnswers(initReview);
            }

            if (nextStat === 'Applied') {
              showToast('Application submitted successfully!');
            } else if (nextStat === 'human_required') {
              showToast('Additional questionnaire answers required below.');
            } else if (nextStat === 'waiting_for_final_review') {
              showToast('Form prepared! Review all answers below before final submit.');
            } else if (nextStat === 'google_login_required') {
              showToast('Google Sign-In required. Please connect your Google session.');
            }
          }
        } else if (detectedMethod === 'googleForm') {
          showToast('Opening Google Form and filling answers with AI...');
          const gfRes = await retryGoogleFormApi(application._id);
          if (gfRes?.data) {
            setApplication(gfRes.data);
            const nextStat = gfRes.data.status || 'Applied';
            setCurrentStatus(nextStat);
            setSelectedStatus(nextStat);
            if (nextStat === 'Applied') {
              showToast('Google Form application submitted successfully!');
            } else if (nextStat === 'google_login_required') {
              showToast('Google Sign-In required. Please connect your Google session in the modal.');
            }
          }
        } else if (detectedMethod === 'email') {
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
          status: isNaukriDirect ? 'waiting_for_review' : 'Applied',
          email: {
            recipient,
            subject,
            body,
            approved: !isNaukriDirect,
            sentAt: isNaukriDirect ? null : new Date().toISOString(),
          },
        });
        if (res.data) {
          setApplication(res.data);
          if (isNaukriDirect) {
            setCurrentStatus('waiting_for_review');
            // Immediately start Naukri workflow
            const approvedRes = await approveAndSendApi(res.data._id);
            if (approvedRes?.data) {
              setApplication(approvedRes.data);
              setCurrentStatus(approvedRes.data.status || 'Applied');
            }
          } else {
            setCurrentStatus('Applied');
          }
        }
        showToast('Application successfully initiated!');
      }

      if (onApplicationUpdated) {
        onApplicationUpdated();
      }
    } catch (err) {
      showToast('Application process error: ' + (err.message || 'Please retry'));
      if (application?._id) {
        getApplicationDetailsApi(application._id)
          .then((fresh) => {
            if (fresh?.data) {
              setApplication(fresh.data);
              if (fresh.data.status) {
                setCurrentStatus(fresh.data.status);
                setSelectedStatus(fresh.data.status);
              }
            }
          })
          .catch(() => {});
      }
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
  const formatAiError = (errorStr) => {
    if (!errorStr) return '';
    
    // Check for common Gemini Rate Limit errors
    if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('Rate limit')) {
      // Try to extract the retry delay if present
      const retryMatch = errorStr.match(/retry in ([\d\.]+s|[\d\.]+ seconds)/i);
      const retryText = retryMatch ? ` Please retry in ${retryMatch[1]}.` : '';
      return `AI Rate Limit Exceeded: The AI model is currently busy or you have reached your request quota.${retryText}`;
    }

    // Check for model not found / service unavailable
    if (errorStr.includes('503') || errorStr.includes('Service Unavailable')) {
      return 'AI Service Temporarily Unavailable: The AI model is currently overloaded. Please try again in a few minutes.';
    }

    // Generic cleanup for structured errors
    if (errorStr.includes('[GoogleGenerativeAI Error]')) {
      return 'AI Processing Error: There was an issue generating your content. This usually happens with complex jobs or large resumes.';
    }

    // Return first sentence or first 100 chars if it's too long
    return errorStr.length > 150 ? errorStr.substring(0, 150) + '...' : errorStr;
  };

  const handleRegenerateDraft = async () => {
    setLoading(true);
    // Clear any existing error state locally so it doesn't show during loading
    if (application) {
      setApplication(prev => ({ ...prev, error: null }));
    }
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
          <div
            className={`text-white text-xs font-semibold px-4 py-2 text-center flex items-center justify-center gap-2 animate-in fade-in ${
              toastType === 'error'
                ? 'bg-rose-600'
                : toastType === 'success'
                ? 'bg-emerald-600'
                : 'bg-blue-600'
            }`}
          >
            {toastType === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : toastType === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0" />
            )}
            <span>{toastMsg}</span>
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

          {!isNaukri && (application?.email?.body || application?.status === 'waiting_for_review') && (
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
          {/* Error Banner */}
          {application?.error && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 flex items-start gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-950 uppercase tracking-wider text-[10px]">AI Pipeline Error / Rate Limit</p>
                <p className="text-red-800 leading-relaxed font-medium">
                  {formatAiError(application.error)}
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <button 
                    onClick={handleRegenerateDraft}
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-700 font-bold rounded-lg hover:bg-red-100 transition-colors shadow-sm cursor-pointer"
                  >
                    Retry Process
                  </button>
                  <p className="text-[10px] text-red-500 italic">This usually happens due to API quotas. Retrying after a few seconds often works.</p>
                </div>
              </div>
            </div>
          )}

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
                  {!isLocked && (currentStatus === 'waiting_for_review' || currentStatus === 'pending') && (
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
                      {isNaukriDirect && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                      {isCompanySite && <Globe className="w-5 h-5 text-purple-600" />}
                      {!isNaukri && detectedMethod === 'email' && <Mail className="w-5 h-5 text-blue-600" />}
                      {!isNaukri && (detectedMethod === 'googleForm' || detectedMethod === 'websiteForm') && (
                        <Globe className="w-5 h-5 text-emerald-600" />
                      )}
                      {!isNaukri && detectedMethod === 'phone' && <Phone className="w-5 h-5 text-purple-600" />}
                      {!isNaukri &&
                        detectedMethod !== 'email' &&
                        detectedMethod !== 'googleForm' &&
                        detectedMethod !== 'websiteForm' &&
                        detectedMethod !== 'phone' && <ExternalLink className="w-5 h-5 text-slate-600" />}
                      <div>
                        <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Application Channel:{' '}
                          <span className={isNaukriDirect ? 'text-blue-600' : isCompanySite ? 'text-purple-600' : 'text-slate-800'}>
                            {isNaukriDirect ? 'Naukri 1-Click Apply' : isCompanySite ? 'Apply on Company Site' : detectedMethod.replace('_', ' ')}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isNaukriDirect
                            ? 'Submit application directly on Naukri using your authenticated profile via id="apply-button".'
                            : isCompanySite
                            ? 'Submit application on official employer careers site via id="company-site-button".'
                            : detectedMethod === 'email'
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
                        title="Read job details and tailor ATS resume"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Tailor Resume</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGoogleModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                        title="Connect or manage Google session for protected Google Forms"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>Google Session</span>
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
                          <option value="Pending">Pending</option>
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

                  {/* 1. NAUKRI 1-CLICK APPLY CHANNEL */}
                  {isNaukriDirect && (
                    <div className="space-y-4">
                      {/* Security Challenge / Session Banner */}
                      {application?.form?.humanReason === 'sessionExpired' && (
                        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-red-900 block">Naukri Session Disconnected / Expired</span>
                            <p className="mt-0.5 text-red-700">
                              Your authenticated Naukri browser session has expired or is disconnected. Please re-authenticate your Naukri account from Settings or the Naukri Connect modal to proceed.
                            </p>
                          </div>
                        </div>
                      )}

                      {(application?.form?.humanReason === 'captcha' ||
                        application?.form?.humanReason === 'otp' ||
                        application?.form?.humanReason === '2fa') && (
                        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-950 block">
                              Security Verification Required ({application.form.humanReason.toUpperCase()})
                            </span>
                            <p className="mt-0.5 text-amber-800">
                              Naukri has requested a security check ({application.form.humanReason.toUpperCase()}). Please complete the challenge in your active browser session, then click continue.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Header Channel Bar */}
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                              Naukri 1-Click
                            </span>
                            <span className="text-xs font-bold text-blue-900">
                              Direct Portal Apply
                            </span>
                            {application?.status && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusBadgeStyle(application.status)}`}>
                                {application.status.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-blue-800">
                            Apply via <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900 font-bold">id="apply-button"</code> using your authenticated Naukri profile.
                          </p>
                          <p className="text-[11px] text-slate-500 truncate max-w-lg">
                            {job.applicationUrl || job.sourceUrl}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={job.applicationUrl || job.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap shadow-xs"
                          >
                            Open on Naukri <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* CHECKPOINT 1: Missing Information / Questions Required By Employer */}
                      {application?.form?.missingQuestions?.length > 0 && (
                        <div className="p-5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-4 shadow-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                                  Checkpoint 1
                                </span>
                                <h3 className="text-sm font-bold text-slate-900">
                                  Additional Information Required by Employer
                                </h3>
                              </div>
                              <p className="text-xs text-slate-600 mt-1">
                                The employer questionnaire includes questions that could not be verified from your profile or resume. Please provide honest answers below.
                              </p>
                            </div>
                            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full shrink-0">
                              {application.form.missingQuestions.length} Question{application.form.missingQuestions.length > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="space-y-3.5 pt-1">
                            {application.form.missingQuestions.map((q) => (
                              <div key={q.questionId} className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                                <label className="block text-xs font-bold text-slate-800">
                                  {q.question} {q.required && <span className="text-red-500">*</span>}
                                </label>

                                {q.options && q.options.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                    {q.options.map((opt) => (
                                      <label
                                        key={opt}
                                        className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                          missingAnswers[q.questionId] === opt
                                            ? 'border-blue-500 bg-blue-50/60 font-semibold text-blue-900'
                                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={q.questionId}
                                          value={opt}
                                          checked={missingAnswers[q.questionId] === opt}
                                          onChange={() =>
                                            setMissingAnswers((prev) => ({
                                              ...prev,
                                              [q.questionId]: opt,
                                            }))
                                          }
                                          className="text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    ))}
                                  </div>
                                ) : q.type === 'textarea' ? (
                                  <textarea
                                    rows={3}
                                    value={missingAnswers[q.questionId] || ''}
                                    onChange={(e) =>
                                      setMissingAnswers((prev) => ({
                                        ...prev,
                                        [q.questionId]: e.target.value,
                                      }))
                                    }
                                    placeholder={q.placeholder || 'Type your answer...'}
                                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                                  />
                                ) : q.type === 'checkbox' ? (
                                  <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(missingAnswers[q.questionId])}
                                      onChange={(e) =>
                                        setMissingAnswers((prev) => ({
                                          ...prev,
                                          [q.questionId]: e.target.checked,
                                        }))
                                      }
                                      className="mt-0.5 text-blue-600 focus:ring-blue-500 rounded"
                                    />
                                    <span className="text-xs text-slate-700 font-medium">
                                      {q.placeholder || q.question}
                                    </span>
                                  </label>
                                ) : q.type === 'password' ? (
                                  <div className="space-y-2">
                                    <div className="relative">
                                      <input
                                        type={showPasswords[q.questionId] ? 'text' : 'password'}
                                        value={missingAnswers[q.questionId] || ''}
                                        onChange={(e) =>
                                          setMissingAnswers((prev) => ({
                                            ...prev,
                                            [q.questionId]: e.target.value,
                                          }))
                                        }
                                        placeholder={q.placeholder || 'Enter password...'}
                                        className="w-full text-xs p-2.5 pr-9 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setShowPasswords((prev) => ({
                                            ...prev,
                                            [q.questionId]: !prev[q.questionId],
                                          }))
                                        }
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      >
                                        {showPasswords[q.questionId] ? (
                                          <EyeOff className="w-4 h-4" />
                                        ) : (
                                          <Eye className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                    {Array.isArray(q.requirements) && q.requirements.length > 0 && (
                                      <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1 text-xs text-slate-700">
                                        <span className="text-[11px] font-bold text-amber-900 block">
                                          Password Requirements:
                                        </span>
                                        <ul className="text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                                          {q.requirements.map((req, rIdx) => (
                                            <li key={rIdx}>{req}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <input
                                    type={q.type === 'number' ? 'number' : 'text'}
                                    value={missingAnswers[q.questionId] || ''}
                                    onChange={(e) =>
                                      setMissingAnswers((prev) => ({
                                        ...prev,
                                        [q.questionId]: e.target.value,
                                      }))
                                    }
                                    placeholder={q.placeholder || 'Type your answer...'}
                                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              size="sm"
                              loading={actionLoading}
                              onClick={handleSubmitMissingAnswers}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Submit Answers & Continue
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* CHECKPOINT 2: Final Application Review & Interactive Form Refill */}
                      {application?.form?.reviewFields?.length > 0 && (
                        <div className="p-5 rounded-xl border border-blue-200 bg-blue-50/30 space-y-4 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-blue-700 text-white rounded text-[10px] font-black uppercase tracking-wider">
                                  Checkpoint 2
                                </span>
                                <h3 className="text-sm font-bold text-slate-900">
                                  Review & Edit AI-Filled Application Form
                                </h3>
                              </div>
                              <p className="text-xs text-slate-600 mt-1">
                                Below is the exact information AI detected and filled into the employer's form. You can edit any field, click <strong>"Refill in Browser"</strong> to re-populate the live form and re-inspect, or <strong>"Confirm & Apply"</strong> to complete your application.
                              </p>
                            </div>
                            <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full shrink-0">
                              {application.form.reviewFields.length} Filled Fields
                            </span>
                          </div>

                          <div className="space-y-3 pt-1">
                            {application.form.reviewFields.map((field) => (
                              <div key={field.questionId} className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                                    <span>{field.question}</span>
                                  </label>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      field.source === 'profile'
                                        ? 'bg-blue-100 text-blue-800'
                                        : field.source === 'resume'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : field.source === 'ai'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-purple-100 text-purple-800'
                                    }`}
                                  >
                                    {field.source === 'profile'
                                      ? 'From Profile'
                                      : field.source === 'resume'
                                      ? 'From Resume'
                                      : field.source === 'ai'
                                      ? 'AI Grounded'
                                      : 'User Edit'}
                                  </span>
                                </div>

                                {field.options && field.options.length > 0 ? (
                                  <div className="space-y-1.5">
                                    <select
                                      value={reviewAnswers[field.questionId] ?? field.answer ?? ''}
                                      onChange={(e) =>
                                        setReviewAnswers((prev) => ({
                                          ...prev,
                                          [field.questionId]: e.target.value,
                                        }))
                                      }
                                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-medium"
                                    >
                                      {field.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : field.type === 'textarea' ? (
                                  <textarea
                                    rows={3}
                                    value={reviewAnswers[field.questionId] ?? field.answer ?? ''}
                                    onChange={(e) =>
                                      setReviewAnswers((prev) => ({
                                        ...prev,
                                        [field.questionId]: e.target.value,
                                      }))
                                    }
                                    placeholder={`Enter ${field.question}...`}
                                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed font-medium"
                                  />
                                ) : field.type === 'radio' && field.options && field.options.length > 0 ? (
                                  <div className="flex flex-wrap gap-3 pt-1">
                                    {field.options.map((opt) => (
                                      <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                                        <input
                                          type="radio"
                                          name={`radio-${field.questionId}`}
                                          value={opt}
                                          checked={(reviewAnswers[field.questionId] ?? field.answer) === opt}
                                          onChange={() =>
                                            setReviewAnswers((prev) => ({
                                              ...prev,
                                              [field.questionId]: opt,
                                            }))
                                          }
                                          className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    ))}
                                  </div>
                                ) : field.type === 'checkbox' || field.isTermsAgreement ? (
                                  <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={
                                        (reviewAnswers[field.questionId] ?? field.answer) === 'true' ||
                                        (reviewAnswers[field.questionId] ?? field.answer) === true
                                      }
                                      onChange={(e) =>
                                        setReviewAnswers((prev) => ({
                                          ...prev,
                                          [field.questionId]: e.target.checked ? 'true' : 'false',
                                        }))
                                      }
                                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                    />
                                    <span className="text-xs font-semibold text-slate-800">
                                      {field.question} <span className="text-emerald-700 font-bold ml-1.5">(Accepted / Agreed)</span>
                                    </span>
                                  </label>
                                ) : field.type === 'password' || /password/i.test(field.question || '') ? (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={reviewAnswers[field.questionId] ?? field.answer ?? ''}
                                      onChange={(e) =>
                                        setReviewAnswers((prev) => ({
                                          ...prev,
                                          [field.questionId]: e.target.value,
                                        }))
                                      }
                                      placeholder="Portal account password..."
                                      className="w-full text-xs p-2.5 font-mono bg-amber-50/50 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-bold text-slate-900"
                                    />
                                    <p className="text-[10px] text-amber-800 font-medium">
                                      Portal-compliant password (8+ chars, uppercase, lowercase, number, symbol). Password & Verify Password fields receive this identical verified password.
                                    </p>
                                  </div>
                                ) : (
                                  <input
                                    type={field.type === 'number' ? 'number' : 'text'}
                                    value={reviewAnswers[field.questionId] ?? field.answer ?? ''}
                                    onChange={(e) =>
                                      setReviewAnswers((prev) => ({
                                        ...prev,
                                        [field.questionId]: e.target.value,
                                      }))
                                    }
                                    placeholder={`Enter ${field.question}...`}
                                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/60">
                            <div className="flex items-center gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                loading={savingAnswers}
                                onClick={handleSaveAnswers}
                                className="text-slate-700 border-slate-300 hover:bg-slate-100 font-bold gap-1 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>Save Changes</span>
                              </Button>

                              <Button
                                size="xs"
                                loading={refillingForm}
                                onClick={handleRefillForm}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1 cursor-pointer shadow-2xs"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${refillingForm ? 'animate-spin' : ''}`} />
                                <span>Refill & Re-verify in Browser</span>
                              </Button>
                            </div>

                            <Button
                              size="sm"
                              loading={actionLoading}
                              onClick={handleConfirmFinal}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 cursor-pointer shadow-xs"
                            >
                              {application.form?.isAccountCreation ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Create Account & Continue</span>
                                </>
                              ) : application.form?.hasStepper && !application.form?.isFinalStep ? (
                                <>
                                  <span>Confirm & Next Step (Step {application.form?.currentStep || 1} of {application.form?.totalSteps || 2})</span>
                                  <ChevronRight className="w-4 h-4" />
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{isNaukri && !application.form?.portalUrl ? 'Confirm & Apply on Naukri' : 'Confirm & Apply on Employer Portal'}</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Tailored ATS Resume Summary */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Tailored ATS Resume Attached
                          </h3>
                          <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> Download PDF
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Your resume has been tailored for <span className="font-semibold text-slate-800">{job.title}</span> at <span className="font-semibold text-slate-800">{job.company}</span>. When approved, this application is processed directly on Naukri without external email dispatch.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. NAUKRI APPLY ON COMPANY SITE CHANNEL */}
                  {isCompanySite && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                              Company Site Apply
                            </span>
                            <span className="text-xs font-bold text-purple-900">
                              External Portal Redirect
                            </span>
                          </div>
                          <p className="text-xs text-purple-800">
                            Apply via <code className="font-mono bg-purple-100 px-1 py-0.5 rounded text-purple-900 font-bold">id="company-site-button"</code> (Workday, Taleo, Lever, Greenhouse, etc.).
                          </p>
                          <p className="text-[11px] text-slate-500 truncate max-w-lg font-mono">
                            {application?.pageAnalysis?.currentUrl || job.applicationUrl || job.sourceUrl}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={application?.pageAnalysis?.currentUrl || job.applicationUrl || job.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                          >
                            Open Application / Careers Portal <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* AI Page & Portal Intelligence Card */}
                      <div className="p-4 rounded-xl border border-indigo-200 bg-linear-to-br from-indigo-50/70 via-white to-purple-50/50 space-y-3.5 shadow-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  AI Page & Portal Intelligence
                                </span>
                                {application?.pageAnalysis && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    application.pageAnalysis.isFormClosed || application.pageAnalysis.pageType === 'form_closed'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}>
                                    {application.pageAnalysis.isFormClosed
                                      ? 'FORM CLOSED / EXPIRED'
                                      : application.pageAnalysis.pageType === 'multi_step_wizard'
                                      ? `MULTI-STEP (${application.pageAnalysis.workflow?.currentStepName || `STEP ${application.pageAnalysis.workflow?.currentStep || 1}`})`
                                      : application.pageAnalysis.pageType === 'modal_application_form'
                                      ? 'APPLICATION MODAL'
                                      : application.pageAnalysis.pageType === 'ats_account_gateway'
                                      ? 'CANDIDATE SIGN-IN GATEWAY'
                                      : application.pageAnalysis.pageType === 'external_ats' || (application.pageAnalysis.currentUrl && application.pageAnalysis.currentUrl.includes('myworkdayjobs'))
                                      ? 'WORKDAY / ATS PORTAL'
                                      : application.pageAnalysis.pageType === 'job_description_page'
                                      ? 'JOB POSTING'
                                      : application.pageAnalysis.pageType === 'job_listings_accordion'
                                      ? 'MULTI-ROLE DIRECTORY'
                                      : application.pageAnalysis.pageType === 'application_form'
                                      ? 'APPLICATION FORM'
                                      : (application.pageAnalysis.pageType || 'PORTAL').replace(/_/g, ' ')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Real-time AI analysis of rendered careers portal, multi-role openings, Google Forms status & email instructions
                              </p>
                            </div>
                          </div>

                          <Button
                            size="xs"
                            variant="outline"
                            loading={analyzingPortal}
                            onClick={handleAnalyzePortal}
                            className="gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50 shrink-0 font-bold cursor-pointer"
                          >
                            <RefreshCw className={`w-3 h-3 ${analyzingPortal ? 'animate-spin' : ''}`} />
                            <span>{application?.pageAnalysis ? 'Re-Analyze with AI' : 'AI Analyze Page'}</span>
                          </Button>
                        </div>

                        {/* Closed Form / Dead Google Form Detection Alert Banner */}
                        {application?.pageAnalysis?.isFormClosed && (
                          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                            <div className="flex items-center gap-2 text-rose-800 font-bold">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>
                                Application Form Closed / Inactive: {application.pageAnalysis.closedFormTitle || 'External Form'}
                              </span>
                            </div>
                            <p className="text-rose-700 text-[11px] leading-relaxed">
                              {application.pageAnalysis.closedFormMessage ||
                                'The Google Form is no longer accepting responses. Direct email application to the recruiter with the required Reference ID is strongly recommended.'}
                            </p>
                            {application.pageAnalysis?.emailContact?.email && (
                              <div className="pt-1 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-rose-900 font-semibold">
                                  Recruiter Contact: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200">{application.pageAnalysis.emailContact.email}</code>
                                </span>
                                <Button
                                  size="xs"
                                  loading={tailoringRoleId === 'form_closed_email'}
                                  onClick={() =>
                                    handleTailorRoleOutreach({
                                      title: job.title || 'Software Developer',
                                      referenceId: application.pageAnalysis.emailContact.referenceId || application.pageAnalysis.matchedRole?.referenceId,
                                      email: application.pageAnalysis.emailContact.email,
                                      descriptionSnippet: job.description || job.title,
                                    })
                                  }
                                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1 cursor-pointer"
                                >
                                  <Mail className="w-3 h-3" />
                                  <span>Generate Resume & Email Draft</span>
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Display Analysis Results if available */}
                        {application?.pageAnalysis && (
                          <div className="space-y-3 pt-1 text-xs">
                            <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-3">
                              <p className="text-slate-700 leading-relaxed font-medium">
                                {application.pageAnalysis.summary}
                              </p>

                              {/* External ATS (Workday, Greenhouse, Lever, etc.) Action Card */}
                              {(application.pageAnalysis.pageType === 'external_ats' ||
                                (application.pageAnalysis.currentUrl &&
                                  (application.pageAnalysis.currentUrl.includes('myworkdayjobs.com') ||
                                    application.pageAnalysis.currentUrl.includes('greenhouse.io') ||
                                    application.pageAnalysis.currentUrl.includes('lever.co') ||
                                    application.pageAnalysis.currentUrl.includes('smartrecruiters.com')))) && (
                                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5 text-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-blue-900 font-bold">
                                      <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
                                      <span>Employer Career Portal / External ATS Detected</span>
                                    </div>
                                    <span className="px-2 py-0.5 bg-blue-200 text-blue-900 rounded font-mono text-[10px] font-bold uppercase">
                                      {application.pageAnalysis.matchedRole?.referenceId
                                        ? `Ref: ${application.pageAnalysis.matchedRole.referenceId}`
                                        : 'Workday / ATS'}
                                    </span>
                                  </div>
                                  <p className="text-blue-800 text-[11px] leading-relaxed">
                                    {application.pageAnalysis.summary ||
                                      'This employer uses an external career system (e.g., Workday). You can proceed directly to the portal with your tailored resume and autofill answers.'}
                                  </p>
                                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200/60">
                                    <a
                                      href={application.pageAnalysis.currentUrl || job.applicationUrl || job.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                                    >
                                      <span>Open Application Portal</span>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={async () => {
                                          await updateApplicationStatusApi(application._id, 'Applied');
                                          setCurrentStatus('Applied');
                                          showToast('Application marked as Applied!');
                                        }}
                                        className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 font-bold gap-1 cursor-pointer"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Mark as Applied</span>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Matched Opening Details (like "Node JS Developer", Reference Id: IN-NJ-01, Exp: 1-3 Years, Loc: Pune) */}
                              {application.pageAnalysis.matchedRole?.title && (
                                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                                      AI Matched Opening for Candidate
                                    </span>
                                    {application.pageAnalysis.matchedRole.referenceId && (
                                      <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono text-[10px] font-bold">
                                        Ref ID: {application.pageAnalysis.matchedRole.referenceId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-800 font-bold text-sm">
                                    <span>{application.pageAnalysis.matchedRole.title}</span>
                                    {application.pageAnalysis.matchedRole.experience && (
                                      <span className="text-xs text-slate-600 font-normal">
                                        • Exp: {application.pageAnalysis.matchedRole.experience}
                                      </span>
                                    )}
                                    {application.pageAnalysis.matchedRole.location && (
                                      <span className="text-xs text-slate-600 font-normal">
                                        • Loc: {application.pageAnalysis.matchedRole.location}
                                      </span>
                                    )}
                                  </div>

                                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-amber-200/50">
                                    <span className="text-[11px] text-amber-900 font-medium">
                                      Target Role Actions:
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="xs"
                                        loading={tailoringRoleId === application.pageAnalysis.matchedRole.title}
                                        onClick={() =>
                                          handleTailorRoleOutreach({
                                            title: application.pageAnalysis.matchedRole.title,
                                            referenceId: application.pageAnalysis.matchedRole.referenceId,
                                            experience: application.pageAnalysis.matchedRole.experience,
                                            location: application.pageAnalysis.matchedRole.location,
                                            email: application.pageAnalysis.emailContact?.email,
                                          })
                                        }
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1 shadow-xs cursor-pointer"
                                      >
                                        <Sparkles className="w-3 h-3" />
                                        <span>⚡ Tailor Resume & Email</span>
                                      </Button>

                                      <Button
                                        size="xs"
                                        loading={advancingPortal}
                                        onClick={() => handleAdvancePortalAction(application.pageAnalysis.matchedRole)}
                                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1 shadow-xs cursor-pointer"
                                      >
                                        <ArrowRight className="w-3 h-3" />
                                        <span>Expand & Click Apply Now</span>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Multi-Openings Explorer & Selector */}
                              {((application.pageAnalysis.openingsList && application.pageAnalysis.openingsList.length > 0) ||
                                (application.pageAnalysis.detectedOpenings && application.pageAnalysis.detectedOpenings.length > 0)) && (
                                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                      <span className="text-xs font-bold text-slate-900 block">
                                        All Openings Detected on Careers Portal ({application.pageAnalysis.openingsList?.length || application.pageAnalysis.detectedOpenings?.length || 0})
                                      </span>
                                      <p className="text-[11px] text-slate-500">
                                        Click any role to generate a role-specific tailored resume and draft an email with its exact Ref ID
                                      </p>
                                    </div>

                                    {selectedRolesBatch.length > 0 && (
                                      <Button
                                        size="xs"
                                        loading={batchApplying}
                                        onClick={handleBatchApplySelectedRoles}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 cursor-pointer shrink-0"
                                      >
                                        <Sparkles className="w-3 h-3" />
                                        <span>Apply to Selected ({selectedRolesBatch.length})</span>
                                      </Button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-200">
                                    {(application.pageAnalysis.openingsList && application.pageAnalysis.openingsList.length > 0
                                      ? application.pageAnalysis.openingsList
                                      : (application.pageAnalysis.detectedOpenings || []).map((t, i) => ({ id: `role-${i}`, title: t }))
                                    ).map((role, idx) => {
                                      const isSelected = selectedRolesBatch.some((r) => (r.id || r.title) === (role.id || role.title));
                                      const isTargetMatch = role.title?.toLowerCase().includes((job.title || '').toLowerCase());
                                      const isTailoringThis = tailoringRoleId === role.title;

                                      return (
                                        <div
                                          key={role.id || idx}
                                          className={`p-3 rounded-lg border transition-all flex flex-col justify-between gap-2 ${
                                            isSelected
                                              ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                                              : isTargetMatch
                                              ? 'bg-blue-50/60 border-blue-200'
                                              : 'bg-white border-slate-200 hover:border-indigo-300'
                                          }`}
                                        >
                                          <div>
                                            <div className="flex items-start justify-between gap-2">
                                              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900 text-xs">
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleBatchRole(role)}
                                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                                                />
                                                <span>{role.title}</span>
                                              </label>
                                              {role.referenceId && (
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[9px] font-bold shrink-0">
                                                  {role.referenceId}
                                                </span>
                                              )}
                                            </div>

                                            {(role.experience || role.location) && (
                                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                                {role.experience && <span>Exp: {role.experience}</span>}
                                                {role.location && <span>• Loc: {role.location}</span>}
                                              </div>
                                            )}

                                            {role.descriptionSnippet && (
                                              <p className="text-[10px] text-slate-500 line-clamp-2 mt-1">
                                                {role.descriptionSnippet}
                                              </p>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                                            <Button
                                              size="xs"
                                              variant="outline"
                                              loading={isTailoringThis}
                                              onClick={() => handleTailorRoleOutreach(role)}
                                              className="flex-1 text-[10px] h-7 gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-bold cursor-pointer"
                                            >
                                              <Sparkles className="w-3 h-3 text-indigo-600" />
                                              <span>Tailor & Draft</span>
                                            </Button>

                                            <Button
                                              size="xs"
                                              loading={advancingPortal}
                                              onClick={() => handleAdvancePortalAction(role)}
                                              className="flex-1 text-[10px] h-7 gap-1 bg-slate-800 hover:bg-slate-900 text-white font-bold cursor-pointer"
                                            >
                                              <ArrowRight className="w-3 h-3" />
                                              <span>Apply (Web)</span>
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Direct Application Email Instructions */}
                              {application.pageAnalysis.emailContact?.email && (
                                <div className="p-3 bg-linear-to-r from-blue-50 to-indigo-50/60 rounded-xl border border-blue-200 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="w-4 h-4 text-blue-700" />
                                      <span className="text-xs font-bold text-blue-900">
                                        Direct Application Email Instructions
                                      </span>
                                    </div>
                                    {application.pageAnalysis.emailContact.referenceId && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-mono text-[10px] font-bold">
                                        Required Ref ID: {application.pageAnalysis.emailContact.referenceId}
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs text-blue-800">
                                    Send tailored resume to: <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">{application.pageAnalysis.emailContact.email}</strong>
                                    {application.pageAnalysis.emailContact.referenceId && (
                                      <span className="ml-2">with Ref ID in Subject</span>
                                    )}
                                  </div>

                                  <div className="pt-1 flex items-center justify-end">
                                    <Button
                                      size="xs"
                                      loading={tailoringRoleId === 'direct_email'}
                                      onClick={() =>
                                        handleTailorRoleOutreach({
                                          title: job.title || 'Software Developer',
                                          referenceId: application.pageAnalysis.emailContact.referenceId,
                                          email: application.pageAnalysis.emailContact.email,
                                          descriptionSnippet: job.description || job.title,
                                        })
                                      }
                                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1 cursor-pointer"
                                    >
                                      <Mail className="w-3 h-3" />
                                      <span>⚡ Generate Tailored Resume & Email</span>
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quick Auto-Fill Cheat Sheet for Company Portal Forms (No email/pitch) */}
                      <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Quick Auto-Fill Cheat Sheet
                          </h3>
                          <span className="text-[11px] text-slate-400">
                            Click to copy fields into employer portal
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
                      </div>
                    </div>
                  )}

                  {/* 3. EMAIL CHANNEL VERIFICATION (REFERRAL / DIRECT HR) */}
                  {!isNaukri && detectedMethod === 'email' && (
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

                  {/* 4. GOOGLE FORM & WEBSITE FORM CHANNEL VERIFICATION */}
                  {!isNaukri && (detectedMethod === 'googleForm' ||
                    detectedMethod === 'websiteForm' ||
                    job.applicationUrl) && (
                    <div className="space-y-4">
                      {/* Google Sign-In Required Alert Banner */}
                      {(application?.googleFormResult?.loginRequired || currentStatus === 'google_login_required') && (
                        <div className="p-4 rounded-xl border border-blue-200 bg-linear-to-r from-blue-50/80 to-indigo-50/70 space-y-3 shadow-xs">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white border border-blue-200 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                              <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                              </svg>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-blue-700 text-white rounded text-[10px] font-black uppercase tracking-wider">
                                  Google Authentication Required
                                </span>
                                <h4 className="text-xs font-bold text-slate-900">
                                  Sign In to Continue to Google Forms
                                </h4>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                This Google Form requires Google Account sign-in (e.g. for resume file attachment or limited responses). Connect your Google session cookies so AI can auto-fill and submit the form, or open the form directly in your browser.
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/60">
                            <div className="flex items-center gap-2">
                              <Button
                                size="xs"
                                onClick={() => setGoogleModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1 cursor-pointer shadow-2xs"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Connect Google Session</span>
                              </Button>

                              <Button
                                size="xs"
                                variant="outline"
                                loading={retryingGoogleForm}
                                onClick={handleRetryGoogleForm}
                                className="text-blue-700 border-blue-300 hover:bg-blue-100/60 font-bold gap-1 cursor-pointer"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${retryingGoogleForm ? 'animate-spin' : ''}`} />
                                <span>Retry Auto-Fill</span>
                              </Button>
                            </div>

                            <a
                              href={application?.googleFormResult?.loginUrl || job.applicationUrl || job.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              <span>Open Form in Browser</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Google Form Successful Submission Banner */}
                      {application?.googleFormResult?.submitted && (
                        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                              <span className="text-xs font-bold text-emerald-900">
                                Google Form Submitted Successfully by AI!
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 bg-emerald-200 text-emerald-900 rounded-full font-bold text-[10px]">
                              {application.googleFormResult.filledCount || 0} Fields Filled
                            </span>
                          </div>
                          <p className="text-xs text-emerald-700 leading-relaxed">
                            All detected questions were answered and submitted to the employer's Google Form.
                            {application.googleFormResult.hasResumeField && ' Your tailored ATS resume was uploaded successfully.'}
                          </p>
                        </div>
                      )}

                      {/* Closed Google Form Banner */}
                      {application?.googleFormResult?.formClosed && (
                        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertCircle className="w-4 h-4 text-rose-600" />
                            <span>Google Form Closed</span>
                          </div>
                          <p className="text-[11px] text-rose-700">
                            This Google Form is no longer accepting responses. Consider applying directly via email if recruiter contact is available.
                          </p>
                        </div>
                      )}

                      {/* Direct External Link */}
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-blue-900">
                            {detectedMethod === 'googleForm'
                              ? 'Google Form Application Link'
                              : 'Official Application URL'}
                          </p>
                          <p className="text-xs text-blue-700 mt-0.5 truncate max-w-lg font-mono">
                            {job.applicationUrl || job.sourceUrl}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {detectedMethod === 'googleForm' && (
                            <Button
                              size="xs"
                              variant="outline"
                              loading={retryingGoogleForm}
                              onClick={handleRetryGoogleForm}
                              className="text-blue-700 border-blue-300 hover:bg-blue-100/60 font-bold gap-1 cursor-pointer"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingGoogleForm ? 'animate-spin' : ''}`} />
                              <span>Re-fill Form</span>
                            </Button>
                          )}
                          <a
                            href={job.applicationUrl || job.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                          >
                            Open Form <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Comprehensive Extracted Form Fields & Resolved Answers View */}
                      {(() => {
                        const rawExtracted = application?.googleFormResult?.extractedFields || [];
                        const reviewFields = application?.form?.reviewFields || [];

                        // Combine / normalize fields to ensure all questions are presented
                        const displayFields =
                          rawExtracted.length > 0
                            ? rawExtracted
                            : reviewFields.map((rf, idx) => ({
                                fieldIndex: idx,
                                questionText: rf.question,
                                fieldType: rf.type || 'text',
                                isRequired: rf.required || false,
                                options: rf.options || [],
                                resolvedAnswer: reviewAnswers[rf.questionId] ?? rf.answer ?? '',
                                isFilled: Boolean(reviewAnswers[rf.questionId] ?? rf.answer),
                                isMissing: !Boolean(reviewAnswers[rf.questionId] ?? rf.answer) && rf.required,
                                error: null,
                              }));

                        if (displayFields.length === 0) {
                          return null;
                        }

                        const totalCount = displayFields.length;
                        const filledCount = displayFields.filter((f) => {
                          const ans =
                            reviewAnswers[f.questionText] ??
                            reviewAnswers[`gf_${f.fieldIndex}`] ??
                            f.resolvedAnswer;
                          return ans && String(ans).trim() !== '' && ans !== '__RESUME_FILE__';
                        }).length;
                        const missingCount = displayFields.filter((f) => {
                          const ans =
                            reviewAnswers[f.questionText] ??
                            reviewAnswers[`gf_${f.fieldIndex}`] ??
                            f.resolvedAnswer;
                          return (!ans || String(ans).trim() === '') && f.isRequired;
                        }).length;

                        // Filter by query and category
                        const filtered = displayFields.filter((f) => {
                          const currentAns = String(
                            reviewAnswers[f.questionText] ??
                              reviewAnswers[`gf_${f.fieldIndex}`] ??
                              f.resolvedAnswer ??
                              ''
                          );
                          const isFilled = Boolean(currentAns.trim());
                          const isMiss = !isFilled && f.isRequired;

                          if (formQuestionFilter === 'filled' && !isFilled) return false;
                          if (formQuestionFilter === 'missing' && !isMiss) return false;
                          if (formQuestionFilter === 'required' && !f.isRequired) return false;

                          if (formSearchQuery.trim()) {
                            const q = formSearchQuery.toLowerCase();
                            const matchQ = (f.questionText || '').toLowerCase().includes(q);
                            const matchA = currentAns.toLowerCase().includes(q);
                            return matchQ || matchA;
                          }
                          return true;
                        });

                        const handleCopyAllQA = () => {
                          const formatted = displayFields
                            .map((f, i) => {
                              const ans =
                                reviewAnswers[f.questionText] ??
                                reviewAnswers[`gf_${f.fieldIndex}`] ??
                                f.resolvedAnswer ??
                                '[Unfilled]';
                              return `Q${i + 1}. ${f.questionText}${f.isRequired ? ' *' : ''}\nAnswer: ${ans}\n`;
                            })
                            .join('\n');
                          copyToClipboard(formatted, 'all_qa');
                          showToast('All form questions & answers copied to clipboard!', 'success');
                        };

                        return (
                          <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden space-y-0">
                            {/* Header & Stats Banner */}
                            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                                    Form Inspection
                                  </span>
                                  <h3 className="text-xs font-bold text-slate-900">
                                    Extracted Questions & Resolved Answers ({totalCount})
                                  </h3>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Review what AI filled on the form, copy individual field values, or update missing answers.
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleCopyAllQA}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                >
                                  {copiedKey === 'all_qa' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                  <span>Copy All Q&A</span>
                                </button>

                                <Button
                                  size="xs"
                                  variant="outline"
                                  loading={retryingGoogleForm}
                                  onClick={handleRetryGoogleForm}
                                  className="text-blue-700 border-blue-300 hover:bg-blue-50 font-bold gap-1 cursor-pointer"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${retryingGoogleForm ? 'animate-spin' : ''}`} />
                                  <span>Re-fill Form</span>
                                </Button>
                              </div>
                            </div>

                            {/* Validation / Missing Notice Banner */}
                            {missingCount > 0 && (
                              <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <span className="font-bold">
                                    {missingCount} Required Question{missingCount > 1 ? 's' : ''} Need Your Input
                                  </span>
                                  <p className="text-[11px] text-amber-800">
                                    Some mandatory fields could not be matched automatically. Fill them in below or copy them directly into the form.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Filters & Search Toolbar */}
                            <div className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setFormQuestionFilter('all')}
                                  className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                                    formQuestionFilter === 'all'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  All ({totalCount})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormQuestionFilter('filled')}
                                  className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                                    formQuestionFilter === 'filled'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span>Filled ({filledCount})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormQuestionFilter('missing')}
                                  className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                                    formQuestionFilter === 'missing'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <AlertCircle className="w-3 h-3 text-amber-500" />
                                  <span>Missing / Required ({missingCount})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormQuestionFilter('required')}
                                  className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                                    formQuestionFilter === 'required'
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  Required Only
                                </button>
                              </div>

                              <div className="relative">
                                <input
                                  type="text"
                                  value={formSearchQuery}
                                  onChange={(e) => setFormSearchQuery(e.target.value)}
                                  placeholder="Search questions or answers..."
                                  className="w-full sm:w-56 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                {formSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setFormSearchQuery('')}
                                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Questions Cards List */}
                            <div className="p-3 max-h-[420px] overflow-y-auto divide-y divide-slate-100 space-y-2">
                              {filtered.length === 0 ? (
                                <div className="p-8 text-center text-xs text-slate-400">
                                  No questions match the selected filter.
                                </div>
                              ) : (
                                filtered.map((f, idx) => {
                                  const fieldKey = f.questionText || `gf_${f.fieldIndex}`;
                                  const currentVal =
                                    reviewAnswers[fieldKey] ?? f.resolvedAnswer ?? '';
                                  const isFilled = Boolean(String(currentVal).trim());
                                  const isMissingAndReq = !isFilled && f.isRequired;

                                  return (
                                    <div
                                      key={idx}
                                      className={`p-3 rounded-xl border transition-all ${
                                        isMissingAndReq
                                          ? 'border-amber-300 bg-amber-50/40'
                                          : isFilled
                                          ? 'border-slate-200 bg-white hover:border-slate-300'
                                          : 'border-slate-100 bg-slate-50/60'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                                              Q{f.fieldIndex !== undefined ? f.fieldIndex + 1 : idx + 1}
                                            </span>
                                            <span className="text-xs font-bold text-slate-900">
                                              {f.questionText}
                                            </span>
                                            {f.isRequired && (
                                              <span
                                                className="text-rose-500 font-bold"
                                                title="Required field"
                                              >
                                                *
                                              </span>
                                            )}
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 capitalize">
                                              {f.fieldType || 'text'}
                                            </span>
                                          </div>

                                          {f.description && (
                                            <p className="text-[11px] text-slate-500 italic">
                                              {f.description}
                                            </p>
                                          )}
                                        </div>

                                        {/* Status Badge */}
                                        <div className="shrink-0 flex items-center gap-1.5">
                                          {isFilled ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              <span>Filled</span>
                                            </span>
                                          ) : isMissingAndReq ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                              <AlertCircle className="w-3 h-3 text-amber-600" />
                                              <span>Required / Empty</span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                              <span>Optional</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Field Value Box with Direct Copy & Inline Edit */}
                                      <div className="mt-2.5 flex items-center gap-2">
                                        <div className="relative flex-1">
                                          {f.options && f.options.length > 0 ? (
                                            <select
                                              value={currentVal}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setReviewAnswers((prev) => ({
                                                  ...prev,
                                                  [fieldKey]: val,
                                                }));
                                              }}
                                              className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                              <option value="">-- Select an option --</option>
                                              {f.options.map((opt, oIdx) => (
                                                <option key={oIdx} value={opt}>
                                                  {opt}
                                                </option>
                                              ))}
                                            </select>
                                          ) : f.fieldType === 'textarea' ? (
                                            <textarea
                                              rows={2}
                                              value={currentVal}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setReviewAnswers((prev) => ({
                                                  ...prev,
                                                  [fieldKey]: val,
                                                }));
                                              }}
                                              placeholder={`Answer for "${f.questionText}"...`}
                                              className="w-full px-3 py-1.5 text-xs text-slate-800 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-sans"
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              value={currentVal}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setReviewAnswers((prev) => ({
                                                  ...prev,
                                                  [fieldKey]: val,
                                                }));
                                              }}
                                              placeholder={`Answer for "${f.questionText}"...`}
                                              className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                          )}
                                        </div>

                                        {/* Individual Copy Value Button */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            copyToClipboard(String(currentVal || ''), `f_${idx}`)
                                          }
                                          disabled={!currentVal}
                                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                                            copiedKey === `f_${idx}`
                                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                              : currentVal
                                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                          }`}
                                          title="Copy this answer to clipboard"
                                        >
                                          {copiedKey === `f_${idx}` ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                                          )}
                                          <span>{copiedKey === `f_${idx}` ? 'Copied' : 'Copy'}</span>
                                        </button>
                                      </div>

                                      {/* Error notice if any */}
                                      {f.error && (
                                        <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                                          <AlertCircle className="w-3 h-3 shrink-0" />
                                          <span>{f.error}</span>
                                        </p>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Bottom Footer Actions */}
                            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-500">
                                Tip: You can edit any answer above, then click <strong>"Save Answers"</strong> or <strong>"Re-fill Form"</strong>.
                              </span>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  loading={savingAnswers}
                                  onClick={handleSaveAnswers}
                                  className="text-slate-700 border-slate-300 hover:bg-slate-100 font-bold cursor-pointer"
                                >
                                  <span>Save Answers</span>
                                </Button>

                                <Button
                                  size="xs"
                                  loading={retryingGoogleForm}
                                  onClick={handleRetryGoogleForm}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1 cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Re-fill Form in Browser</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

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

                  {/* 5. PHONE / WHATSAPP CHANNEL VERIFICATION */}
                  {!isNaukri && (detectedMethod === 'phone' || application?.phoneApplication) && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-purple-700 text-white rounded text-[10px] font-black uppercase tracking-wider">
                              Phone Application
                            </span>
                            <span className="text-xs font-bold text-purple-900">Direct Recruiter Contact</span>
                          </div>
                          <p className="text-sm font-bold text-purple-800 mt-1">
                            {application?.phoneApplication?.phoneNumber || job.phone || job.contactNumber || 'Contact number in posting'}
                          </p>
                          {application?.phoneApplication?.bestTimeToCall && (
                            <p className="text-[11px] text-purple-700 mt-0.5">
                              Recommended time: <strong>{application.phoneApplication.bestTimeToCall}</strong>
                            </p>
                          )}
                        </div>
                        {(application?.phoneApplication?.phoneNumber || job.phone || job.contactNumber) && (
                          <a
                            href={`tel:${application?.phoneApplication?.phoneNumber || job.phone || job.contactNumber}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap shadow-xs"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call Recruiter</span>
                          </a>
                        )}
                      </div>

                      {/* Phone Call Script Card */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>AI Word-for-Word Call Script</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                application?.phoneApplication?.callScript || body,
                                'phone_script'
                              )
                            }
                            className="text-purple-600 hover:text-purple-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'phone_script' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Copy Script</span>
                          </button>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">
                          {application?.phoneApplication?.callScript ||
                            `Hello, my name is ${candidateInfo?.fullName || 'Candidate'}. I am calling regarding the ${job.title} role at ${job.company}. I have strong experience in ${(job.skills || []).slice(0, 3).join(', ')} and would love to discuss how I can add immediate value to your team.`}
                        </div>

                        {/* Talking Points */}
                        {application?.phoneApplication?.talkingPoints?.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Key Talking Points:
                            </span>
                            <ul className="space-y-1 text-xs text-slate-700">
                              {application.phoneApplication.talkingPoints.map((point, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
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
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={handleRegenerateDraft}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold hover:bg-slate-50 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-tailor
                        </button>
                      )}
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
                    <div className="flex items-center gap-2">
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={handleRegenerateDraft}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold hover:bg-slate-50 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-draft
                        </button>
                      )}
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
                        {['Pending', 'waiting_for_review', 'Applied', 'Interview', 'Offer', 'Rejected'].map((st) => {
                          const isSelected = (selectedStatus || currentStatus).toLowerCase() === st.toLowerCase();
                          const label = st === 'waiting_for_review' ? 'Waiting Review' : st === 'Pending' ? 'Pending' : st;
                          
                          // If locked, only allow post-applied statuses
                          const isAllowed = !isLocked || ['Applied', 'Interview', 'Offer', 'Rejected'].includes(st);
                          if (!isAllowed) return null;

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
            {!isLocked && detectedMethod === 'email' && (
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
              disabled={isLocked}
              className={`w-full sm:w-auto gap-1.5 cursor-pointer font-bold px-5 ${
                isLocked 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLocked ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Application Locked
                </>
              ) : isNaukriDirect ? (
                application?.status === 'waiting_for_final_review' || application?.form?.reviewFields?.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm & Apply on Naukri
                  </>
                ) : application?.form?.missingQuestions?.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Submit Answers to Proceed
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Start 1-Click Apply on Naukri
                  </>
                )
              ) : isCompanySite ? (
                application?.status === 'waiting_for_final_review' || application?.form?.reviewFields?.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm & Submit on Portal
                  </>
                ) : application?.form?.missingQuestions?.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Submit Answers to Proceed
                  </>
                ) : application?.pageAnalysis?.nextRecommendedAction === 'click_opening_apply' ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Apply on Company Site
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Apply on Company Site
                  </>
                )
              ) : detectedMethod === 'email' ? (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Approve & Send Email
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

      {/* Role Outreach & Direct Email Sender Drawer / Modal */}
      {roleDraftModalOpen && activeRoleDraft && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 bg-linear-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/30 rounded-lg">
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">Tailored Application Draft</h3>
                    {activeRoleDraft.referenceId && (
                      <span className="px-1.5 py-0.5 bg-indigo-500/40 text-indigo-200 rounded font-mono text-[10px] font-bold">
                        Ref ID: {activeRoleDraft.referenceId}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">{activeRoleDraft.roleTitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRoleDraftModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Recruiter Email & Subject */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Recruiter / Hiring Contact Email
                  </label>
                  <input
                    type="email"
                    value={activeRoleDraft.email.recipient}
                    onChange={(e) =>
                      setActiveRoleDraft((prev) => ({
                        ...prev,
                        email: { ...prev.email, recipient: e.target.value },
                      }))
                    }
                    placeholder="e.g. Recruitment@Rajyugsolutions.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Email Subject Line (Includes Ref ID)
                  </label>
                  <input
                    type="text"
                    value={activeRoleDraft.email.subject}
                    onChange={(e) =>
                      setActiveRoleDraft((prev) => ({
                        ...prev,
                        email: { ...prev.email, subject: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Personalized Pitch / Email Body
                  </label>
                  <textarea
                    rows={8}
                    value={activeRoleDraft.email.body}
                    onChange={(e) =>
                      setActiveRoleDraft((prev) => ({
                        ...prev,
                        email: { ...prev.email, body: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tailored Resume PDF Attachment Badge */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-600 text-white rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">
                      Role-Tailored ATS Resume Attached
                    </span>
                    <span className="text-[10px] text-indigo-700">
                      Auto-tailored for {activeRoleDraft.roleTitle} (Ref: {activeRoleDraft.referenceId || 'N/A'})
                    </span>
                  </div>
                </div>

                {application?._id && (
                  <a
                    href={`/api/applications/${application._id}/download-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700 rounded-lg font-bold text-[11px] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </a>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRoleDraftModalOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                loading={sendingDirectEmail}
                onClick={handleSendRoleDirectEmail}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 px-5 cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Application Email Now</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Google Session & Authentication Modal */}
      <GoogleSessionModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        onSessionSaved={() => handleRetryGoogleForm()}
      />
    </div>
  );
};
