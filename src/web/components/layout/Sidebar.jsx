import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Briefcase,
  FileText,
  Bot,
  Settings,
  LogOut,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNaukri } from '../../context/NaukriContext';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const { isConnected, openNaukriModal } = useNaukri();

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Job Search', path: '/jobs', icon: Search },
    { label: 'Applications', path: '/applications', icon: Briefcase },
    { label: 'Resume Builder', path: '/resume', icon: FileText },
    { label: 'AI Assistant', path: '/settings/ai', icon: Bot },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <aside className="w-64 bg-[#0F172A] text-slate-300 flex flex-col justify-between h-screen shrink-0 border-r border-slate-800 sticky top-0">
      <div>
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-900/40">
            <Sparkles className="w-5 h-5 fill-white/20" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-tight">AI Apply Job</span>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* Quick Naukri Session Button */}
          <div className="pt-2 border-t border-slate-800/60 mt-2">
            <button
              type="button"
              onClick={() => openNaukriModal()}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors cursor-pointer group"
              title={isConnected ? 'Naukri account connected' : 'Click to connect Naukri account'}
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-blue-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                  N
                </div>
                <span>Naukri</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isConnected
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isConnected ? 'Connected' : 'Connect'}
              </span>
            </button>
          </div>
        </nav>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center shrink-0 border border-slate-600">
              {getInitials(user?.username || user?.email)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.username || 'User'}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
