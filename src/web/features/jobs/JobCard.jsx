import React, { useState } from 'react';
import {
  MapPin,
  Sparkles,
  Building2,
  Mail,
  Globe,
  ExternalLink,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Info,
  Plus,
  Terminal,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const JobCard = ({
  job,
  onApply,
  onReview,
  onDelete,
  applyingId,
  onSelectPosition,
  isSelected,
  onToggleSelect,
  onAddToQueue,
  isQueued,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState(null);

  const getLogoInitial = (company) => {
    return company ? company.charAt(0).toUpperCase() : 'C';
  };

  const getLogoColor = (company) => {
    const chars = company || 'A';
    const code = chars.charCodeAt(0) % 3;
    if (code === 0) return 'bg-blue-600';
    if (code === 1) return 'bg-slate-800';
    return 'bg-emerald-700';
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this job?')) return;

    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete(job._id);
      }
    } catch (err) {
      console.error('Delete job failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const method =
    job.applicationMethod ||
    (job.hrEmail ? 'email' : job.applicationUrl ? 'form' : 'direct');

  // Availability evaluation result from backend
  const availability = job.availability || {
    canApply: true,
    status: 'AVAILABLE',
    reasonCode: 'READY',
    title: 'Ready to apply',
    message: 'Profile and resume are ready.',
    severity: 'success',
  };

  const isApplying = applyingId === job._id || availability.status === 'APPLYING';
  const isAlreadyApplied =
    availability.status === 'COMPLETED' ||
    availability.reasonCode === 'ALREADY_APPLIED' ||
    availability.reasonCode === 'APPLICATION_SUBMITTED';
  const isActionRequired = availability.status === 'USER_ACTION_REQUIRED';
  const isReviewRequired = availability.status === 'REVIEW_REQUIRED';
  const isCannotApply = !availability.canApply && !isAlreadyApplied && !isActionRequired;

  // Extract multiple positions if any
  const positions = availability.positions || job.positions || [];
  const hasMultiplePositions = positions.length > 1;

  const handlePositionClick = (e, pos) => {
    e.stopPropagation();
    if (!pos.clickable && pos.clickable !== undefined) return;
    setSelectedPositionId(pos.id);
    if (onSelectPosition) {
      onSelectPosition(job, pos);
    }
  };

  const handleActionClick = (e) => {
    e.stopPropagation();
    if (isCannotApply || isAlreadyApplied) {
      // If disabled/already applied, user clicking can still view review/details if they explicitly desire
      if (onReview) onReview(job);
      return;
    }
    const targetJob = selectedPositionId
      ? { ...job, selectedPosition: positions.find((p) => p.id === selectedPositionId) }
      : job;
    onReview ? onReview(targetJob) : onApply(targetJob);
  };

  return (
    <div
      onClick={() => onReview && onReview(job)}
      className={`bg-white border rounded-xl p-5 hover:border-blue-400 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group relative ${
        isCannotApply ? 'border-slate-200 bg-slate-50/40' : 'border-slate-200'
      }`}
    >
      {/* Delete button (absolute top-right) */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-10 opacity-0 group-hover:opacity-100 cursor-pointer"
        title="Delete job"
      >
        {isDeleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>

      {/* Left Info */}
      <div className="flex items-start gap-3.5 min-w-0">
        {onToggleSelect && (
          <div className="pt-3.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect(job._id)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
            />
          </div>
        )}
        <div
          className={`w-12 h-12 rounded-xl ${getLogoColor(
            job.company
          )} text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform`}
        >
          {getLogoInitial(job.company)}
        </div>

        <div className="space-y-1.5 min-w-0">
          <div className="pr-8">
            {/* Top badges */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                  job.source === 'naukri'
                    ? 'bg-blue-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {job.source === 'naukri' ? 'Naukri' : 'Referral'}
              </span>

              {job.applicationMethod && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    job.applicationMethod === 'naukri_direct' ||
                    job.applicationMethod === 'naukri'
                      ? 'bg-blue-100 text-blue-800'
                      : job.applicationMethod === 'company_site'
                      ? 'bg-purple-100 text-purple-800'
                      : job.applicationMethod === 'email'
                      ? 'bg-emerald-100 text-emerald-800'
                      : job.applicationMethod === 'googleForm'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {job.applicationMethod === 'naukri_direct' ||
                  job.applicationMethod === 'naukri'
                    ? 'Naukri 1-Click'
                    : job.applicationMethod === 'company_site'
                    ? 'Company Site'
                    : job.applicationMethod.replace('_', ' ')}
                </span>
              )}

              {/* Multiple positions count tag */}
              {hasMultiplePositions && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {positions.length} Openings
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
              {job.title}
            </h3>
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" /> {job.company}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {job.location || 'Remote / Unspecified'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 capitalize font-medium text-slate-600">
              {method === 'email' && <Mail className="w-3.5 h-3.5 text-blue-500" />}
              {(method === 'form' ||
                method === 'googleForm' ||
                method === 'websiteForm') && (
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
              )}
              {method !== 'email' &&
                method !== 'form' &&
                method !== 'googleForm' &&
                method !== 'websiteForm' && (
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                )}
              {method === 'email'
                ? 'By Email'
                : method.includes('Form')
                ? 'By Form'
                : 'By Portal'}
            </span>
          </div>

          {/* Multiple Positions Selection Chips */}
          {hasMultiplePositions && (
            <div className="pt-2 pb-1 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <span>Select role to apply:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {positions.map((pos) => {
                  const isSelected =
                    selectedPositionId === pos.id || (!selectedPositionId && pos.isPriority);
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={(e) => handlePositionClick(e, pos)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {pos.isPriority && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      )}
                      <span>{pos.title}</span>
                      {pos.isPriority && (
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                          (Top Match)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skills */}
          {job.skills && job.skills.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              {job.skills.slice(0, 3).map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-slate-100 border border-slate-200/80 rounded-md text-xs text-slate-700 font-medium"
                >
                  {skill}
                </span>
              ))}
              {job.skills.length > 3 && (
                <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-xs font-medium">
                  +{job.skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Score & Action Section */}
      <div className="flex flex-col items-start md:items-end justify-between md:justify-center gap-2.5 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 min-w-[210px]">
        <div className="text-left md:text-right w-full flex md:flex-col items-center md:items-end justify-between">
          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 fill-emerald-600" />
            {job.matchScore || job.matchPercentage || 92}% match
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{job.postedDays || 'Recently'}</p>
        </div>

        {/* Action Button & Availability Details */}
        <div className="flex flex-col items-start md:items-end gap-1.5 w-full">
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {(job.sourceUrl || job.applicationUrl) && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    job.sourceUrl || job.applicationUrl,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
                className="px-3 text-xs font-semibold flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Open job posting"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View
              </Button>
            )}

            {onAddToQueue && (
              <Button
                size="sm"
                variant={isQueued ? 'ghost' : 'outline'}
                disabled={isQueued}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToQueue(job);
                }}
                className={`px-3 text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                  isQueued
                    ? 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed'
                    : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                }`}
                title={isQueued ? 'Already queued' : 'Enqueue for automated application'}
              >
                {isQueued ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Plus className="w-3.5 h-3.5" />}
                {isQueued ? 'Queued' : 'Add to Queue'}
              </Button>
            )}

            {/* Apply Button with dynamic availability styling */}
            <Button
              size="sm"
              onClick={handleActionClick}
              disabled={isCannotApply || isAlreadyApplied}
              className={`px-4 font-semibold text-xs transition-all ${
                isCannotApply
                  ? 'opacity-40 bg-slate-200 text-slate-500 border border-slate-300 hover:bg-slate-200 cursor-not-allowed shadow-none'
                  : isAlreadyApplied
                  ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100 cursor-not-allowed'
                  : isActionRequired
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs'
                  : isReviewRequired
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs'
                  : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs'
              }`}
            >
              {isApplying ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying...
                </span>
              ) : isAlreadyApplied ? (
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                </span>
              ) : isActionRequired ? (
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Action Required
                </span>
              ) : isCannotApply ? (
                'Apply'
              ) : (
                'Review & Apply'
              )}
            </Button>
          </div>

          {/* User Explanation directly near/below the Apply button */}
          {(isCannotApply || isAlreadyApplied || isActionRequired || isReviewRequired) && (
            <div className="text-left md:text-right max-w-[240px] pt-0.5">
              <div
                className={`text-[11px] font-bold flex items-center md:justify-end gap-1 ${
                  isAlreadyApplied
                    ? 'text-emerald-700'
                    : isCannotApply
                    ? 'text-amber-800'
                    : 'text-blue-700'
                }`}
              >
                {isCannotApply && <AlertCircle className="w-3 h-3 shrink-0" />}
                {isAlreadyApplied && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                {isActionRequired && <Info className="w-3 h-3 shrink-0" />}
                <span>{availability.title || 'Apply unavailable'}</span>
              </div>
              {availability.message && (
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                  {availability.message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
