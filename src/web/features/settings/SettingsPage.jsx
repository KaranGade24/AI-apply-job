import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bot, User, Search, Briefcase, FileText } from 'lucide-react';
import { AiSettingsTab } from './aiSettings/AiSettingsTab';

export const SettingsPage = () => {
  const location = useLocation();

  const tabs = [
    { id: 'ai', label: 'AI Settings', path: '/settings/ai', icon: Bot },
    { id: 'user', label: 'User Profile', path: '/settings/user', icon: User },
    { id: 'job', label: 'Job Search', path: '/settings/job', icon: Search },
    { id: 'application', label: 'Applications', path: '/settings/application', icon: Briefcase },
    { id: 'resume', label: 'Resume', path: '/settings/resume', icon: FileText },
  ];

  // If path is exactly /settings, render AiSettingsTab by default
  const isRootSettings = location.pathname === '/settings';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Settings Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex items-center gap-2 -mb-px overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path || (isRootSettings && tab.id === 'ai');
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* View Content */}
      <div className="pt-2">
        {isRootSettings ? <AiSettingsTab /> : <Outlet />}
      </div>
    </div>
  );
};
