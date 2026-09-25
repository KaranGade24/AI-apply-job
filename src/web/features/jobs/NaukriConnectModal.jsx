import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Mail, KeyRound, Globe, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const NaukriConnectModal = ({ isOpen, onClose, onConnected }) => {
  const [loginMethod, setLoginMethod] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusData, setStatusData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchNaukriStatus();
    }
  }, [isOpen]);

  const fetchNaukriStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/naukri/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setStatusData(json.data);
      }
    } catch (e) {
      // Silent catch
    }
  };

  if (!isOpen) return null;

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const body = {
        loginMethod,
        username: loginMethod === 'credentials' ? username : null,
        password: loginMethod === 'credentials' ? password : null,
      };

      const res = await fetch('/api/naukri/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to connect Naukri account');
      }

      await fetchNaukriStatus();
      if (onConnected) onConnected();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/naukri/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchNaukriStatus();
      if (onConnected) onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-400/30">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold">Connect Naukri Account</h3>
              <p className="text-xs text-slate-300">Encrypted session storage for automated job search</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status banner */}
          {statusData && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                statusData.isConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusData.isConnected ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  Status:{' '}
                  <strong className="capitalize">
                    {statusData.isConnected ? 'Connected & Active' : 'Not Connected'}
                  </strong>
                  {statusData.accountIdentifier && ` (${statusData.accountIdentifier})`}
                </span>
              </div>
              {statusData.isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-2.5 py-1 bg-rose-600 text-white rounded-md text-[11px] font-bold hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Strategy Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              How would you like to connect?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLoginMethod('credentials')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  loginMethod === 'credentials'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold">Email / Password</span>
                </div>
                <p className="text-[11px] text-slate-500">Connect using encrypted Naukri credentials</p>
              </button>

              <button
                type="button"
                onClick={() => setLoginMethod('google')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  loginMethod === 'google'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold">Continue with Google</span>
                </div>
                <p className="text-[11px] text-slate-500">Interactive browser login (No password stored)</p>
              </button>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            {loginMethod === 'credentials' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Naukri Email / Username</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. user@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Naukri Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span>Google / Naukri Interactive OAuth Login</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Clicking Connect will authenticate your session securely using Google. Your Google password is
                  never requested or stored by our system.
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-60"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{loading ? 'Connecting...' : 'Save & Connect Session'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
