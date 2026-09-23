import React, { useState, useContext } from 'react';
import { ShieldCheck, Eye, EyeOff, Save, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingsContext } from '../../../context/SettingsContext';
import { AI_PROVIDERS, AI_MODELS } from '../../../constants/config';

export const AiSettingsTab = () => {
  const { settings, updateSettings, loading } = useContext(SettingsContext);
  const [provider, setProvider] = useState(settings.aiSettings?.provider || 'googleGemini');
  const [model, setModel] = useState(settings.aiSettings?.model || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(settings.aiSettings?.temperature ?? 0.1);
  const [apiKey, setApiKey] = useState(settings.aiSettings?.apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = async () => {
    const updated = {
      ...settings,
      aiSettings: {
        provider,
        model,
        temperature: parseFloat(temperature),
        apiKey,
      },
    };
    await updateSettings(updated);
    setSavedMsg('Settings saved successfully!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  const currentModels = AI_MODELS[provider] || AI_MODELS.googleGemini;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure your AI model, provider and API key for personalized experience.
          </p>
        </div>

        <Button loading={loading} onClick={handleSave} className="gap-2 cursor-pointer">
          <Save className="w-4 h-4" /> Save Changes
        </Button>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Card 1: Model Configuration */}
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Model Configuration</h2>
            <p className="text-xs text-slate-500 mt-0.5">Choose the AI model and temperature for better results.</p>
          </div>

          <div className="space-y-4">
            <Select
              label="Provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel(AI_MODELS[e.target.value]?.[0]?.id || 'gemini-2.5-flash');
              }}
              options={AI_PROVIDERS}
            />

            <Select
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              options={currentModels}
            />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">Temperature</label>
                <span className="text-xs font-bold text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200 tabular-nums">
                  {temperature}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>0.0 (Strict)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: API Key */}
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">API Key</h2>
            <p className="text-xs text-slate-500 mt-0.5">Add your own Gemini API key (optional).</p>
          </div>

          {/* Encrypted Notice Banner */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-medium">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Your API key is encrypted and stored securely.</span>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Input
                label="Gemini API Key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 text-xs"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button size="sm" onClick={handleSave} className="cursor-pointer">
                Update API Key
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setApiKey('')}
                className="text-slate-600 cursor-pointer"
              >
                Remove
              </Button>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center gap-2.5 text-blue-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Using your own API key gives you higher limits and faster responses.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
