import React, { useState, useContext } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingsContext } from '../../../context/SettingsContext';

export const JobSettingTab = () => {
  const { settings, updateSettings, loading } = useContext(SettingsContext);
  const [keywords, setKeywords] = useState(
    (settings.jobSetting?.keywords || []).join(', ')
  );
  const [locations, setLocations] = useState(
    (settings.jobSetting?.locations || []).join(', ')
  );
  const [minExp, setMinExp] = useState(settings.jobSetting?.minExp ?? 0);
  const [maxExp, setMaxExp] = useState(settings.jobSetting?.maxExp ?? 2);
  const [preferredMethods, setPreferredMethods] = useState(
    settings.jobSetting?.preferredApplicationMethods || ['email', 'googleForm', 'phone', 'unknown']
  );
  const [savedMsg, setSavedMsg] = useState('');

  React.useEffect(() => {
    if (settings.jobSetting) {
      setKeywords((settings.jobSetting.keywords || []).join(', '));
      setLocations((settings.jobSetting.locations || []).join(', '));
      setMinExp(settings.jobSetting.minExp ?? 0);
      setMaxExp(settings.jobSetting.maxExp ?? 2);
      if (settings.jobSetting.preferredApplicationMethods) {
        setPreferredMethods(settings.jobSetting.preferredApplicationMethods);
      }
    }
  }, [settings.jobSetting]);

  const toggleMethod = (methodKey) => {
    if (preferredMethods.includes(methodKey)) {
      setPreferredMethods(preferredMethods.filter((m) => m !== methodKey));
    } else {
      setPreferredMethods([...preferredMethods, methodKey]);
    }
  };

  const handleSave = async () => {
    const updated = {
      ...settings,
      jobSetting: {
        ...settings.jobSetting,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        locations: locations.split(',').map((l) => l.trim()).filter(Boolean),
        minExp: Number(minExp),
        maxExp: Number(maxExp),
        preferredApplicationMethods: preferredMethods,
      },
    };
    await updateSettings(updated);
    setSavedMsg('Job search settings saved!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Job Search Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure target keywords, experience ranges, locations, and preferred application channels.
          </p>
        </div>

        <Button loading={loading} onClick={handleSave} className="gap-2 cursor-pointer">
          <Save className="w-4 h-4" /> Save Job Settings
        </Button>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Search Filters</h2>

          <Input
            label="Target Keywords (comma separated)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="MERN Developer, Node.js Developer, React Developer"
          />

          <Input
            label="Preferred Locations (comma separated)"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="Pune, Remote, Bengaluru"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Experience (Years)"
              type="number"
              value={minExp}
              onChange={(e) => setMinExp(e.target.value)}
            />
            <Input
              label="Max Experience (Years)"
              type="number"
              value={maxExp}
              onChange={(e) => setMaxExp(e.target.value)}
            />
          </div>
        </Card>

        {/* Preferred Application Methods */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Preferred Application Methods</h2>
            <p className="text-xs text-slate-500 mt-0.5">Filter discovered jobs by your preferred contact/application channel.</p>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { id: 'email', label: 'By Email (direct email application)' },
              { id: 'googleForm', label: 'By Google Form (docs.google.com/forms)' },
              { id: 'websiteForm', label: 'By Website Form (Direct careers page)' },
              { id: 'phone', label: 'By Phone Number / Call' },
              { id: 'unknown', label: 'Unknown / Generic Link' },
            ].map(({ id, label }) => (
              <label
                key={id}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 cursor-pointer text-xs font-semibold text-slate-800"
              >
                <input
                  type="checkbox"
                  checked={preferredMethods.includes(id)}
                  onChange={() => toggleMethod(id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
