import React from 'react';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export const ResultCard = ({ submission = {}, status = '' }) => {
  const isSubmitted = status === 'COMPLETED' || submission?.submitted;
  const isFailed = status === 'FAILED';

  return (
    <div className={`p-4 rounded-lg border ${isSubmitted ? 'bg-green-50 border-green-200 text-green-900' : isFailed ? 'bg-red-50 border-red-200 text-red-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
      <div className="flex items-center space-x-2 mb-2">
        {isSubmitted ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : isFailed ? <AlertCircle className="w-5 h-5 text-red-600" /> : <Clock className="w-5 h-5 text-blue-600" />}
        <h4 className="font-semibold">Application Status: {status}</h4>
      </div>
      {submission?.confirmationNumber && (
        <p className="text-sm font-mono mt-1">Confirmation Number: {submission.confirmationNumber}</p>
      )}
      {submission?.redactedSummary && (
        <pre className="text-xs bg-white/60 p-2 rounded mt-2 font-mono whitespace-pre-wrap">{submission.redactedSummary}</pre>
      )}
    </div>
  );
};
