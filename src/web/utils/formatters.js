export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const formatStatusLabel = (status) => {
  if (!status) return 'Pending';
  const s = String(status);
  switch (s.toLowerCase()) {
    case 'waiting_for_review':
      return 'Waiting Review';
    case 'waiting_for_final_review':
      return 'Final Review';
    case 'human_required':
      return 'Action Required';
    case 'google_login_required':
      return 'Google Sign-In Required';
    case 'resolving_answers':
      return 'Resolving Answers';
    case 'analyzing_portal':
      return 'Analyzing Portal';
    case 'unsupported_method':
      return 'Manual Review';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed / Retry';
    case 'applied':
    case 'sent':
      return 'Applied';
    case 'interview':
      return 'Interview';
    case 'offer':
      return 'Offer';
    case 'rejected':
      return 'Rejected';
    default:
      return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }
};

export const getStatusBadgeStyle = (status) => {
  const normalized = String(status || '').toLowerCase();
  switch (normalized) {
    case 'interview':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'applied':
    case 'sent':
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'offer':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-300 font-bold';
    case 'human_required':
    case 'google_login_required':
      return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
    case 'waiting_for_final_review':
    case 'waiting_for_review':
      return 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
    case 'pending':
    case 'processing':
    case 'resolving_answers':
    case 'analyzing_portal':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};
