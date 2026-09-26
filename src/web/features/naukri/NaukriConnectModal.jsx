import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Globe,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  FileCode,
  Loader2,
  RefreshCw,
  LogOut,
  ExternalLink
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  connectNaukriApi,
  getNaukriStatusApi,
  saveNaukriSessionApi,
  disconnectNaukriApi
} from '../../services/naukriService';

export const NaukriConnectModal = ({ isOpen, onClose, onStatusChange }) => {
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [activeTab, setActiveTab] = useState('browser'); // 'browser' | 'cookies'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cookiesInput, setCookiesInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const res = await getNaukriStatusApi();
      if (res.data) {
        setStatusData(res.data);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to fetch Naukri status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [isOpen]);

  const handleTestOrConnect = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const res = await connectNaukriApi();
      const data = res.data;
      setStatusData(data);

      if (data.authenticated && data.status === 'connected') {
        setSuccessMessage('Naukri session is active and verified!');
        if (onStatusChange) onStatusChange(data);
      } else {
        setErrorMessage(
          data.message || 'Session expired or not found. Please log in below to connect your account.'
        );
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || 'Failed to connect to Naukri. Please check connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOneTimeLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both your Naukri email and password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');

      const res = await saveNaukriSessionApi({
        oneTimeLogin: {
          username: email,
          password: password
        }
      });

      const data = res.data;
      setStatusData(data);
      setSuccessMessage('Naukri authenticated successfully! Encrypted session stored.');
      setPassword(''); // Clear password immediately from component memory
      if (onStatusChange) onStatusChange(data);
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || 'Login failed. Please verify your credentials or use cookie import.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImportCookies = async (e) => {
    e.preventDefault();
    if (!cookiesInput.trim()) {
      setErrorMessage('Please paste your cookies or storageState JSON.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');

      let payload = {};
      try {
        const parsed = JSON.parse(cookiesInput.trim());
        if (Array.isArray(parsed)) {
          payload.cookies = parsed;
        } else if (parsed.cookies) {
          payload.storageState = parsed;
        } else {
          payload.cookies = [parsed];
        }
      } catch {
        // Plain string format or cookie header line format: name=val; name2=val2
        const rawCookies = cookiesInput
          .split(';')
          .map((part) => {
            const [name, ...val] = part.trim().split('=');
            return name ? { name: name.trim(), value: val.join('=').trim(), domain: '.naukri.com', path: '/' } : null;
          })
          .filter(Boolean);

        payload.cookies = rawCookies;
      }

      const res = await saveNaukriSessionApi(payload);
      const data = res.data;
      setStatusData(data);
      setSuccessMessage('Naukri session imported and verified successfully!');
      setCookiesInput('');
      if (onStatusChange) onStatusChange(data);
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || 'Failed to import session. Please verify cookie validity.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Naukri session?')) return;

    try {
      setLoading(true);
      setErrorMessage('');
      await disconnectNaukriApi();
      setStatusData({ connected: false, status: 'disconnected', userName: '' });
      setSuccessMessage('Naukri account disconnected.');
      if (onStatusChange) onStatusChange({ connected: false, status: 'disconnected' });
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to disconnect.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = statusData?.connected || statusData?.status === 'connected';
  const isAuthRequired = statusData?.status === 'authenticationRequired';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              N
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Naukri Integration</h2>
              <p className="text-xs text-slate-500 mt-0.5">Encrypted Browser Session & Cookie Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Security Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-800 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="font-semibold">Security Boundary:</strong> Your credentials are never stored. Only the authenticated browser session is encrypted with <strong className="font-semibold">AES-256-GCM</strong> and securely reused.
            </p>
          </div>

          {/* Status Display */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Status</span>
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
                </span>
              ) : isAuthRequired ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Session Expired
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                  Not Connected
                </span>
              )}
            </div>

            {statusData?.userName && (
              <p className="text-xs text-slate-700">
                <span className="font-medium text-slate-500">Connected Profile: </span>
                <span className="font-semibold text-slate-900">{statusData.userName}</span>
              </p>
            )}

            {statusData?.lastValidatedAt && (
              <p className="text-[11px] text-slate-400">
                Last validated: {new Date(statusData.lastValidatedAt).toLocaleString()}
              </p>
            )}

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestOrConnect}
                loading={loading}
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {isConnected ? 'Re-verify Session' : 'Check Session on Naukri'}
              </Button>

              {isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <LogOut className="w-3.5 h-3.5" /> Disconnect
                </Button>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Connect / Reconnect Actions */}
          {(!isConnected || isAuthRequired) && (
            <div className="space-y-4 pt-2">
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('browser')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'browser'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Quick Sign-in (1-Time)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cookies')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'cookies'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" /> Cookie / Session Import
                </button>
              </div>

              {activeTab === 'browser' && (
                <form onSubmit={handleOneTimeLogin} className="space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Enter your credentials for a one-time browser login. Playwright will log in, capture the session cookies, and discard your password immediately.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Naukri Email / Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Naukri Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full text-xs font-bold cursor-pointer"
                  >
                    Authenticate & Save Encrypted Session
                  </Button>
                </form>
              )}

              {activeTab === 'cookies' && (
                <form onSubmit={handleImportCookies} className="space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Logged in using Google SSO? Copy your cookies or storageState JSON from your browser and paste here:
                  </p>
                  <textarea
                    rows={4}
                    placeholder='[{"name": "nlogin", "value": "..."}, {"name": "cId", "value": "..."}]'
                    value={cookiesInput}
                    onChange={(e) => setCookiesInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-between">
                    <a
                      href="https://www.naukri.com/nlogin/login"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      Open Naukri in new tab <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      type="submit"
                      loading={loading}
                      size="sm"
                      className="text-xs font-bold cursor-pointer"
                    >
                      Import & Encrypt
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs font-semibold">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NaukriConnectModal;
