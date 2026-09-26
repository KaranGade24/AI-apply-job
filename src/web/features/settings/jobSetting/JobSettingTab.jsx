import React, { useState, useContext } from 'react';
import { Save, CheckCircle2, Globe2, Briefcase } from 'lucide-react';
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
  const [maxExp, setMaxExp] = useState(settings.jobSetting?.maxExp ?? 10);
  const [maxJobsToSearch, setMaxJobsToSearch] = useState(settings.jobSetting?.maxJobsToSearch ?? 20);
  const [searchMode, setSearchMode] = useState(settings.jobSetting?.searchMode || 'byQuery');
  const [preferredMethods, setPreferredMethods] = useState(
    settings.jobSetting?.preferredApplicationMethods || [
      'email',
      'googleForm',
      'websiteForm',
      'phone',
      'unknown',
      'naukri_direct',
      'company_site',
    ]
  );
  const [savedMsg, setSavedMsg] = useState('');

  React.useEffect(() => {
    if (settings.jobSetting) {
      setKeywords((settings.jobSetting.keywords || []).join(', '));
      setLocations((settings.jobSetting.locations || []).join(', '));
      setMinExp(settings.jobSetting.minExp ?? 0);
      setMaxExp(settings.jobSetting.maxExp ?? 10);
      setMaxJobsToSearch(settings.jobSetting.maxJobsToSearch ?? 20);
      setSearchMode(settings.jobSetting.searchMode || 'byQuery');
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
        maxJobsToSearch: Number(maxJobsToSearch),
        searchMode: searchMode,
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

          <Input
            label="Max Jobs to Search (Scrape Limit)"
            type="number"
            value={maxJobsToSearch}
            onChange={(e) => setMaxJobsToSearch(e.target.value)}
            placeholder="20"
            helperText="Limits the number of jobs the AI will scan per source to manage performance and quota."
          />
        </Card>

        {/* Preferred Application Methods */}
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Preferred Application Methods</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filter discovered jobs by your preferred contact and application channel.
            </p>
          </div>

          {/* Naukri Specific Methods */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                Naukri Portal Channels
              </span>
              <span className="text-xs text-slate-400 font-medium">Naukri.com apply types</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50/80 cursor-pointer text-xs font-semibold text-slate-800 transition-colors">
                <input
                  type="checkbox"
                  checked={preferredMethods.includes('naukri_direct') || preferredMethods.includes('naukri')}
                  onChange={() => toggleMethod('naukri_direct')}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5"
                />
                <div>
                  <span className="font-bold text-blue-900">Naukri 1-Click Apply</span>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                    Direct in-portal application on Naukri via <code className="text-blue-700 font-mono bg-blue-100/70 px-1 py-0.5 rounded">id="apply-button"</code> using your authenticated Naukri profile.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-purple-200 bg-purple-50/40 hover:bg-purple-50/80 cursor-pointer text-xs font-semibold text-slate-800 transition-colors">
                <input
                  type="checkbox"
                  checked={preferredMethods.includes('company_site')}
                  onChange={() => toggleMethod('company_site')}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 mt-0.5"
                />
                <div>
                  <span className="font-bold text-purple-900">Apply on Company Site</span>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                    External employer portal redirect via <code className="text-purple-700 font-mono bg-purple-100/70 px-1 py-0.5 rounded">id="company-site-button"</code> (Workday, Taleo, Greenhouse, Lever, etc.).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Referral & Direct Channels */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                Referral & Direct Channels
              </span>
              <span className="text-xs text-slate-400 font-medium">JobViaReferral & standard listings</span>
            </div>

            <div className="space-y-2">
              {[
                { id: 'email', label: 'By Email (direct email application)', desc: 'Direct resume and cover letter dispatch to hiring HR emails.' },
                { id: 'googleForm', label: 'By Google Form (docs.google.com/forms)', desc: 'Applications submitted via Google Form links.' },
                { id: 'websiteForm', label: 'By Website Form (Direct careers page)', desc: 'Official employer website forms and applicant portals.' },
                { id: 'phone', label: 'By Phone Number / Call', desc: 'Recruiter or hiring contact phone numbers.' },
                { id: 'unknown', label: 'Unknown / Generic Link', desc: 'Generic referral posts with custom external links.' },
              ].map(({ id, label, desc }) => (
                <label
                  key={id}
                  className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 cursor-pointer text-xs font-semibold text-slate-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={preferredMethods.includes(id)}
                    onChange={() => toggleMethod(id)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span>{label}</span>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
