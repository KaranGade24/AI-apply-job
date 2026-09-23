import React from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const Header = () => {
  const { user } = useAuth();

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10 shrink-0">
      <div className="flex items-center gap-2">
        {/* Dynamic header slot or search context */}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full"></span>
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center border border-slate-300">
            {getInitials(user?.username || user?.email)}
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    </header>
  );
};
