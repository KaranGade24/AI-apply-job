import React, { useState, useContext } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingsContext } from '../../../context/SettingsContext';
import { RESUME_TEMPLATES } from '../../../constants/config';

export const ResumeSettingTab = () => {
  const { settings, updateSettings, loading } = useContext(SettingsContext);
  const [template, setTemplate] = useState(settings.resumeSetting?.defaultTemplate || 'ATS Modern');
  const [targetPages, setTargetPages] = useState(settings.resumeSetting?.targetPages ?? 2);
  const [savedMsg, setSavedMsg] = useState('');

  React.useEffect(() => {
    if (settings.resumeSetting) {
      setTemplate(settings.resumeSetting.defaultTemplate || 'ATS Modern');
      setTargetPages(settings.resumeSetting.targetPages ?? 2);
    }
  }, [settings.resumeSetting]);

  const handleSave = async () => {
    const updated = {
      ...settings,
      resumeSetting: {
        ...settings.resumeSetting,
        defaultTemplate: template,
        targetPages: Number(targetPages),
      },
    };
    await updateSettings(updated);
    setSavedMsg('Resume default settings saved!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Resume Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Default template selection and page length auto-fit scaling rules.
          </p>
        </div>

        <Button loading={loading} onClick={handleSave} className="gap-2 cursor-pointer">
          <Save className="w-4 h-4" /> Save Resume Settings
        </Button>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
        </div>
      )}

      <Card className="p-6 space-y-5 max-w-2xl">
        <Select
          label="Default PDF Template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          options={RESUME_TEMPLATES.map((t) => ({ id: t.id, name: t.name }))}
        />

        <Input
          label="Target Page Count (Auto-Fit Scaling Target)"
          type="number"
          value={targetPages}
          onChange={(e) => setTargetPages(e.target.value)}
          helperText="The PDF compiler auto-scales font size and margins to fit strictly within this page count."
        />
      </Card>
    </div>
  );
};
