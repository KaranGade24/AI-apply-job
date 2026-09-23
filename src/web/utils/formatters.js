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
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'waiting_for_review':
    case 'pending':
    case 'processing':
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
};
