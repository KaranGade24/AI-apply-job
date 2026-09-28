import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ExternalLink,
  Globe,
  Sparkles,
  Lock,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  getGoogleSessionStatusApi,
  launchGoogleBrowserApi,
  disconnectGoogleSessionApi,
} from '../../services/googleSessionService';

export const GoogleSessionModal = ({ isOpen, onClose, onSessionSaved }) => {
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [browserRunning, setBrowserRunning] = useState(false);

  const fetchStatus = async () => {
    try {
      setErrorMessage('');
      const res = await getGoogleSessionStatusApi();
      const data = res?.data || res || {};
      setStatusData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to fetch Google session status.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setErrorMessage('');
      setSuccessMessage('');
      setBrowserRunning(false);

      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !loading) {
          onClose?.();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  const handleLaunchBrowserLogin = async () => {
    try {
      setLoading(true);
      setBrowserRunning(true);
      setErrorMessage('');
      setSuccessMessage('');

      const res = await launchGoogleBrowserApi();
      const data = res?.data || res || {};

      setStatusData(data);
      setSuccessMessage(
        res.message || 'Google account successfully connected! Session cookies saved in database and window closed.'
      );
      setBrowserRunning(false);

      if (onSessionSaved) {
        onSessionSaved(data);
      }
    } catch (err) {
      setBrowserRunning(false);
      setErrorMessage(
        err.message || 'Google login was interrupted or timed out. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Google session?')) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const res = await disconnectGoogleSessionApi();
      const data = res?.data || res || {};
      setStatusData(data);
      setSuccessMessage('Google session disconnected successfully.');
      if (onSessionSaved) onSessionSaved(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to disconnect Google session.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = statusData?.connected || statusData?.status === 'connected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Google Account Sign-In
              </h2>
              <p className="text-xs text-slate-500">
                Click button to open browser window, sign in, and auto-save session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              isConnected
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {isConnected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  Status: {isConnected ? 'Connected & Verified' : 'Sign-In Required'}
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  {isConnected
                    ? `Connected as ${statusData?.userEmail || 'Google Account'}. Session cookies are stored in database.`
                    : 'Click the button below to open a browser window and log into your Google Account.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isConnected && (
                <Button
                  size="xs"
                  variant="outline"
                  loading={loading}
                  onClick={handleDisconnect}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                loading={loading}
                onClick={fetchStatus}
                className="text-slate-600 hover:bg-white/80 cursor-pointer"
                title="Refresh Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Active Browser Running Notification */}
          {browserRunning && (
            <div className="p-4 bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2 text-xs animate-pulse">
              <div className="flex items-center gap-2 text-blue-900 font-bold">
                <Globe className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <span>Playwright Browser Window Active</span>
              </div>
              <p className="text-blue-800 text-[11px] leading-relaxed">
                A browser window has opened for Google Sign-In. Please log in with your email, password, and approve any 2-Step Verification prompts.
              </p>
              <p className="text-blue-900 font-semibold text-[11px] pt-1">
                &rarr; As soon as you log in, the system will automatically detect it, save your session cookies in the database, and close the window!
              </p>
            </div>
          )}

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* The Single-Click Login Action Card */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-xs">
              <svg className="w-8 h-8" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                {isConnected ? 'Reconnect or Refresh Google Session' : 'Sign In with Google Account'}
              </h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Clicking the button opens a Playwright browser window. Log into your Google Account manually. The system automatically captures and saves your session cookies into the database, then closes the window.
              </p>
            </div>

            {/* The One Button */}
            <Button
              type="button"
              size="lg"
              loading={loading}
              onClick={handleLaunchBrowserLogin}
              className="w-full max-w-sm mx-auto bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 py-3 rounded-xl cursor-pointer shadow-md text-sm transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Waiting for Login in Browser...</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  <span>Open Browser to Sign In with Google</span>
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Zero password stored. Cookies encrypted with AES-256-GCM.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Automatic Session Capture & Window Auto-Close</span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="text-slate-700 border-slate-200 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GoogleSessionModal;
