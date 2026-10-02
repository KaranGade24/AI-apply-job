import React, { useState, useContext } from 'react';
import { Save, User, Mail, Phone, MapPin, Globe, Link2, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingsContext } from '../../../context/SettingsContext';

export const UserSettingTab = () => {
  const { settings, updateSettings, loading } = useContext(SettingsContext);
  const [formData, setFormData] = useState({
    fullName: settings.userSetting?.fullName || '',
    email: settings.userSetting?.email || '',
    phone: settings.userSetting?.phone || '',
    location: settings.userSetting?.location || '',
    headline: settings.userSetting?.headline || '',
    portfolioUrl: settings.userSetting?.portfolioUrl || '',
    githubUrl: settings.userSetting?.githubUrl || '',
    linkedinUrl: settings.userSetting?.linkedinUrl || '',
    workAuthorization: settings.userSetting?.workAuthorization || 'Yes',
    requiresSponsorship: settings.userSetting?.requiresSponsorship ?? false,
    noticePeriod: settings.userSetting?.noticePeriod || 'Immediate',
    expectedSalary: settings.userSetting?.expectedSalary || 'Competitive',
  });

  React.useEffect(() => {
    if (settings.userSetting) {
      setFormData({
        fullName: settings.userSetting.fullName || '',
        email: settings.userSetting.email || '',
        phone: settings.userSetting.phone || '',
        location: settings.userSetting.location || '',
        headline: settings.userSetting.headline || '',
        portfolioUrl: settings.userSetting.portfolioUrl || '',
        githubUrl: settings.userSetting.githubUrl || '',
        linkedinUrl: settings.userSetting.linkedinUrl || '',
        workAuthorization: settings.userSetting.workAuthorization || 'Yes',
        requiresSponsorship: settings.userSetting.requiresSponsorship ?? false,
        noticePeriod: settings.userSetting.noticePeriod || 'Immediate',
        expectedSalary: settings.userSetting.expectedSalary || 'Competitive',
      });
    }
  }, [settings.userSetting]);

  const [savedMsg, setSavedMsg] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await updateSettings({
      ...settings,
      userSetting: formData,
    });
    setSavedMsg('User profile settings saved!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Profile Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your candidate profile information used across job applications and resume generation.
          </p>
        </div>

        <Button loading={loading} onClick={handleSave} className="gap-2 cursor-pointer">
          <Save className="w-4 h-4" /> Save Profile
        </Button>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
        </div>
      )}

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              icon={<User className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              icon={<Mail className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              icon={<Phone className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label="Location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              icon={<MapPin className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <Input
            label="Professional Headline"
            name="headline"
            value={formData.headline}
            onChange={handleChange}
            placeholder="Full Stack Web Developer (MERN)"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <Input
              label="Portfolio URL"
              name="portfolioUrl"
              value={formData.portfolioUrl}
              onChange={handleChange}
              icon={<Globe className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label="GitHub URL"
              name="githubUrl"
              value={formData.githubUrl}
              onChange={handleChange}
              icon={<Link2 className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label="LinkedIn URL"
              name="linkedinUrl"
              value={formData.linkedinUrl}
              onChange={handleChange}
              icon={<Link2 className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Autonomous Application Defaults</h3>
            <p className="text-xs text-slate-500 mb-4">
              Answers used by the AI Browser Agent to automatically fill common job application questions across any site.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Work Authorization Status"
                name="workAuthorization"
                value={formData.workAuthorization}
                onChange={handleChange}
                placeholder="Yes / Legally authorized to work"
                helperText="Auto-filled for work eligibility questions"
              />

              <Input
                label="Notice Period / Availability"
                name="noticePeriod"
                value={formData.noticePeriod}
                onChange={handleChange}
                placeholder="Immediate / 15 days"
                helperText="Auto-filled for availability/start date"
              />

              <Input
                label="Expected Salary / CTC"
                name="expectedSalary"
                value={formData.expectedSalary}
                onChange={handleChange}
                placeholder="Competitive / $120,000"
                helperText="Auto-filled for compensation inquiries"
              />

              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50 mt-5">
                <input
                  type="checkbox"
                  id="requiresSponsorship"
                  name="requiresSponsorship"
                  checked={formData.requiresSponsorship}
                  onChange={(e) => setFormData({ ...formData, requiresSponsorship: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <label htmlFor="requiresSponsorship" className="text-xs font-semibold text-slate-800 cursor-pointer">
                  Require visa sponsorship now or in the future
                  <span className="block text-[11px] font-normal text-slate-500">
                    If unchecked, agent automatically answers "No" to sponsorship questions
                  </span>
                </label>
              </div>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
};
