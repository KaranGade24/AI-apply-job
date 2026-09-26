import React, { useState } from 'react';
import { MapPin, Sparkles, Building2, Mail, Globe, ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const JobCard = ({ job, onApply, onReview, onDelete, applyingId }) => {
  const [isDeleting, setIsDeleting] = useState(false);

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

  const method = job.applicationMethod || (job.hrEmail ? 'email' : job.applicationUrl ? 'form' : 'direct');

  return (
    <div
      onClick={() => onReview && onReview(job)}
      className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group relative"
    >
      {/* Delete button (absolute top-right) */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-10 opacity-0 group-hover:opacity-100 cursor-pointer"
        title="Delete job"
      >
        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>

      {/* Left Info */}
      <div className="flex items-start gap-4 min-w-0">
        <div
          className={`w-12 h-12 rounded-xl ${getLogoColor(
            job.company
          )} text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform`}
        >
          {getLogoInitial(job.company)}
        </div>

        <div className="space-y-1.5 min-w-0">
          <div className="pr-8"> {/* Padding for delete button */}
            <div className="flex items-center gap-1.5 mb-1">
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
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                  {job.applicationMethod === 'naukri' ? 'Naukri Apply' : job.applicationMethod.replace('_', ' ')}
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
              {(method === 'form' || method === 'googleForm' || method === 'websiteForm') && (
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
              )}
              {method !== 'email' &&
                method !== 'form' &&
                method !== 'googleForm' &&
                method !== 'websiteForm' && (
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                )}
              {method === 'email' ? 'By Email' : method.includes('Form') ? 'By Form' : 'By Portal'}
            </span>
          </div>

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

      {/* Right Score & Action */}
      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
        <div className="text-right">
          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 fill-emerald-600" />
            {job.matchScore || job.matchPercentage || 92}% match
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{job.postedDays || 'Recently'}</p>
        </div>

        <div className="flex items-center gap-2">
          {(job.sourceUrl || job.applicationUrl) && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                window.open(job.sourceUrl || job.applicationUrl, '_blank', 'noopener,noreferrer');
              }}
              className="px-3 text-xs font-semibold flex items-center gap-1 text-slate-600 hover:text-slate-900"
              title="Open job posting"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View
            </Button>
          )}

          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReview ? onReview(job) : onApply(job);
            }}
            className="px-4 font-semibold text-xs cursor-pointer"
          >
            Review & Apply
          </Button>
        </div>
      </div>
    </div>
  );
};

