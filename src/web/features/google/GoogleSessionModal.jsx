import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  FileCode,
  RefreshCw,
  LogOut,
  ExternalLink,
  Lock,
  HelpCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  getGoogleSessionStatusApi,
  saveGoogleSessionApi,
  disconnectGoogleSessionApi,
} from '../../services/googleSessionService';

export const GoogleSessionModal = ({ isOpen, onClose, onSessionSaved }) => {
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [cookiesInput, setCookiesInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const res = await getGoogleSessionStatusApi();
      const data = res?.data || res || {};
      setStatusData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to fetch Google session status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setErrorMessage('');
      setSuccessMessage('');
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
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

  const handleSaveCookies = async (e) => {
    e?.preventDefault();
    if (!cookiesInput.trim()) {
      setErrorMessage('Please paste your Google session cookies or storageState JSON.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');

      const res = await saveGoogleSessionApi({
        cookies: cookiesInput.trim(),
      });
      const data = res?.data || res || {};

      setStatusData(data);
      setSuccessMessage(
        res.message || 'Google session successfully saved and verified! Protected forms can now be auto-filled.'
      );
      setCookiesInput('');

      if (onSessionSaved) {
        onSessionSaved(data);
      }
    } catch (err) {
      setErrorMessage(
        err.message || 'Failed to validate Google session. Please verify cookies and try again.'
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
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
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
                Google Session & Forms Authentication
              </h2>
              <p className="text-xs text-slate-500">
                Securely store session cookies to auto-fill protected Google Forms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
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
                  Status: {isConnected ? 'Connected & Active' : 'Sign-In Required / Disconnected'}
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  {isConnected
                    ? `Connected as ${statusData?.userEmail || 'Google Account'}. Protected Google Forms will auto-fill with this session.`
                    : 'Google Forms that require sign-in (e.g. for resume uploads or single responses) need your session.'}
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
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold gap-1"
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
                className="text-slate-600 hover:bg-white/80"
                title="Refresh Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Cookie Import Form */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-blue-600" />
                <span>Import Google Session Cookies (JSON / StorageState)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showHelp ? 'Hide Instructions' : 'How to get cookies?'}</span>
              </button>
            </div>

            {/* Quick Helper Accordion */}
            {showHelp && (
              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-2">
                <p className="font-bold text-blue-900">How to get your Google session cookies:</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-900/90 leading-relaxed">
                  <li>
                    Log in to your Google Account (or Google Drive/Forms) in your standard browser.
                  </li>
                  <li>
                    Install a free extension like <strong>Cookie-Editor</strong> (available on Chrome, Edge, Firefox).
                  </li>
                  <li>
                    Navigate to <code className="bg-white px-1 py-0.5 rounded font-mono border border-blue-200">google.com</code> or <code className="bg-white px-1 py-0.5 rounded font-mono border border-blue-200">accounts.google.com</code>.
                  </li>
                  <li>
                    Open Cookie-Editor, click <strong>Export</strong> &rarr; <strong>Export as JSON</strong>.
                  </li>
                  <li>
                    Paste the exported JSON text into the box below and click <strong>Save & Verify Session</strong>.
                  </li>
                </ol>
                <div className="flex items-center gap-1.5 text-[10px] text-blue-700 font-semibold pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Your cookies are encrypted with AES-256-GCM. Passwords are never stored.</span>
                </div>
              </div>
            )}

            <textarea
              rows={6}
              value={cookiesInput}
              onChange={(e) => setCookiesInput(e.target.value)}
              placeholder='[&#10;  {&#10;    "name": "SID",&#10;    "value": "...",&#10;    "domain": ".google.com"&#10;  }&#10;]'
              className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-slate-50 focus:bg-white transition-colors"
            />

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Zero password storage. AES-256-GCM encrypted.</span>
              </div>

              <Button
                size="sm"
                loading={loading}
                onClick={handleSaveCookies}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 cursor-pointer shadow-xs"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Save & Verify Google Session</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="text-slate-700 border-slate-200"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GoogleSessionModal;
