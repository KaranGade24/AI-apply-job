import React, { useState, useContext } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingsContext } from '../../../context/SettingsContext';

export const ApplicationSettingTab = () => {
  const { settings, updateSettings, loading } = useContext(SettingsContext);
  const [autoApply, setAutoApply] = useState(settings.applicationSetting?.autoApplyEnabled ?? false);
  const [maxDaily, setMaxDaily] = useState(settings.applicationSetting?.maxDailyApplications ?? 20);
  const [notify, setNotify] = useState(settings.applicationSetting?.notifyOnStatusChange ?? true);
  const [preferredEmail, setPreferredEmail] = useState(
    settings.applicationSetting?.preferredEmail || ''
  );
  const [savedMsg, setSavedMsg] = useState('');

  React.useEffect(() => {
    if (settings.applicationSetting) {
      setAutoApply(settings.applicationSetting.autoApplyEnabled ?? false);
      setMaxDaily(settings.applicationSetting.maxDailyApplications ?? 20);
      setNotify(settings.applicationSetting.notifyOnStatusChange ?? true);
      setPreferredEmail(settings.applicationSetting.preferredEmail || '');
    }
  }, [settings.applicationSetting]);

  const handleSave = async () => {
    const updated = {
      ...settings,
      applicationSetting: {
        autoApplyEnabled: autoApply,
        maxDailyApplications: Number(maxDaily),
        notifyOnStatusChange: notify,
        preferredEmail,
      },
    };
    await updateSettings(updated);
    setSavedMsg('Application automation settings saved!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure automated application limits, status change alerts, and notification preferences.
          </p>
        </div>

        <Button loading={loading} onClick={handleSave} className="gap-2 cursor-pointer">
          <Save className="w-4 h-4" /> Save Application Settings
        </Button>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
        </div>
      )}

      <Card className="p-6 space-y-6 max-w-2xl">
        <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer">
          <div>
            <p className="text-sm font-bold text-slate-900">Enable Automated Job Applications</p>
            <p className="text-xs text-slate-500 mt-0.5">Allow AI agent to auto-submit applications for matching jobs</p>
          </div>
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </label>

        <Input
          label="Maximum Daily Applications Limit"
          type="number"
          value={maxDaily}
          onChange={(e) => setMaxDaily(e.target.value)}
          helperText="Prevents rate limiting and spam flags on job boards"
        />

        <Input
          label="Notification Email Address"
          type="email"
          value={preferredEmail}
          onChange={(e) => setPreferredEmail(e.target.value)}
        />

        <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
          />
          <span>Send email alerts when an application status changes to Interview or Offer</span>
        </label>
      </Card>
    </div>
  );
};
