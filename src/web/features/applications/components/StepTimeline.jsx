import React from 'react';

export const StepTimeline = ({ status = 'idle', stepCount = 0 }) => {
  const steps = [
    { key: 'STARTING', label: 'Starting Agent' },
    { key: 'FILLING', label: 'Filling Form' },
    { key: 'WAITING_FOR_CONFIRMATION', label: 'Review & Confirm' },
    { key: 'SUBMITTING', label: 'Submitting' },
    { key: 'VERIFYING', label: 'Verifying Receipt' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  return (
    <div className="py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
        <span>Execution Step: {stepCount}</span>
        <span className="font-semibold uppercase text-indigo-600">{status}</span>
      </div>
      <div className="flex items-center space-x-2">
        {steps.map((s, i) => {
          const isPassed = steps.findIndex((x) => x.key === status) > i;
          const isCurrent = s.key === status;
          return (
            <div key={s.key} className="flex-1 flex items-center">
              <div
                className={`h-2 flex-1 rounded-full ${
                  isPassed ? 'bg-green-500' : isCurrent ? 'bg-indigo-600 animate-pulse' : 'bg-gray-200'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
