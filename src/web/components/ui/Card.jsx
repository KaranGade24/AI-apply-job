import React from 'react';
import { twMerge } from 'tailwind-merge';

export const Card = ({ children, className = '', ...props }) => {
  return (
    <div
      className={twMerge('bg-white border border-slate-200 rounded-xl p-5 shadow-xs', className)}
      {...props}
    >
      {children}
    </div>
  );
};
