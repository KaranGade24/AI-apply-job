import React from 'react';
import { twMerge } from 'tailwind-merge';

export const Select = React.forwardRef(({
  label,
  options = [],
  error,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={twMerge(
          'w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 transition-colors focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer',
          error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
          className
        )}
        {...props}
      >
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value || opt.id : opt;
          const lbl = typeof opt === 'object' ? opt.label || opt.name : opt;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';
