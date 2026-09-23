import React from 'react';
import { twMerge } from 'tailwind-merge';

export const Input = React.forwardRef(({
  label,
  error,
  helperText,
  className = '',
  icon,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={twMerge(
            'w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500',
            icon && 'pl-9',
            error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';
