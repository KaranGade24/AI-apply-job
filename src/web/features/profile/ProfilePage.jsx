import React, { useState, useEffect } from 'react';
import {
  User,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Code,
  Sparkles,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  getProfileApi,
  updateProfileApi,
  saveReusableAnswerApi,
  syncProfileFromResumeApi,
} from '../../services/profileService';

export const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  // Form states
  const [personal, setPersonal] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    headline: '',
    summary: '',
  });

  const [links, setLinks] = useState({
    linkedin: '',
    github: '',
    portfolio: '',
  });

  const [applicationAnswers, setApplicationAnswers] = useState({
    workAuthorization: 'Yes, legally authorized to work',
    requiresSponsorship: false,
    noticePeriod: 'Immediate / 15 days',
    expectedSalary: 'Competitive',
    currentSalary: '',
    willingToRelocate: 'Yes',
    preferredWorkMode: 'Hybrid / Remote',
    yearsOfExperience: '1-3 years',
    professionalSummary: '',
    customAnswers: [],
  });

  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState('');

  // Custom question add state
  const [customKey, setCustomKey] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await getProfileApi();
      if (res?.data) {
        const p = res.data;
        setProfile(p);
        if (p.personal) setPersonal({ ...personal, ...p.personal });
        if (p.links) setLinks({ ...links, ...p.links });
        if (p.applicationAnswers) setApplicationAnswers({ ...applicationAnswers, ...p.applicationAnswers });
        if (p.skills) setSkills(p.skills);
      }
    } catch (err) {
      showToast('Failed to load profile: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        personal,
        links,
        applicationAnswers,
        skills,
      };
      const res = await updateProfileApi(payload);
      if (res?.data) {
        showToast('Profile updated successfully!', 'success');
        setProfile(res.data);
      }
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromResume = async () => {
    setSyncing(true);
    try {
      const res = await syncProfileFromResumeApi();
      if (res?.data) {
        showToast('Profile synchronized from resume facts without fabrication!', 'success');
        loadProfile();
      }
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddSkill = () => {
    if (!newSkill.trim()) return;
    if (!skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
    }
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleAddCustomAnswer = async () => {
    if (!customKey.trim() || !customAnswer.trim()) {
      showToast('Please provide a field identifier and answer', 'error');
      return;
    }
    try {
      const res = await saveReusableAnswerApi({
        questionKey: customKey.trim(),
        questionText: customQuestion.trim() || customKey.trim(),
        answerText: customAnswer.trim(),
      });
      if (res?.data) {
        showToast('Truthful answer saved for automated reuse!', 'success');
        setApplicationAnswers(res.data);
        setCustomKey('');
        setCustomQuestion('');
        setCustomAnswer('');
      }
    } catch (err) {
      showToast('Save answer failed: ' + err.message, 'error');
    }
  };

  const handleDeleteCustomAnswer = (keyToDelete) => {
    const updated = (applicationAnswers.customAnswers || []).filter(
      (a) => a.questionKey !== keyToDelete
    );
    setApplicationAnswers({ ...applicationAnswers, customAnswers: updated });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 border transition-all ${
            toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-800'
              : toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-800'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <User className="w-6 h-6 text-blue-600" />
            Candidate Profile & Reusable Answers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Section 3, 12 & 30 — The central source of truth. The AI uses these verified facts to fill forms without hallucinations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncFromResume}
            loading={syncing}
            className="text-xs font-semibold cursor-pointer gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Sync from Resume
          </Button>
          <Button
            size="sm"
            onClick={handleSaveProfile}
            loading={saving}
            className="text-xs font-semibold cursor-pointer bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            <Save className="w-3.5 h-3.5" /> Save All Changes
          </Button>
        </div>
      </div>

      {/* Zero Hallucination Guarantee Callout */}
      <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-950 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-sm block mb-0.5">Zero Hallucination Protocol Active (Section 30)</span>
          <span>
            The system strictly fills application questionnaires using facts stored in your profile and verified resume data. When a job portal requests an unknown question (such as security clearances or unique disclosures), automation pauses and requests your answer instead of inventing one.
          </span>
        </div>
      </div>

      {/* Personal Info & Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 border-slate-200 bg-white">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-blue-600" />
              Personal Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={personal.fullName}
                  onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={personal.email}
                  onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={personal.phone}
                  onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Location (City, Country)</label>
                <input
                  type="text"
                  value={personal.location}
                  onChange={(e) => setPersonal({ ...personal, location: e.target.value })}
                  placeholder="e.g. San Francisco, CA / Pune, India"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={personal.headline}
                  onChange={(e) => setPersonal({ ...personal, headline: e.target.value })}
                  placeholder="e.g. Full Stack Developer | Node.js, React, MongoDB"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Executive Summary / Bio</label>
                <textarea
                  rows={3}
                  value={personal.summary}
                  onChange={(e) => setPersonal({ ...personal, summary: e.target.value })}
                  placeholder="Brief summary of experience, strengths, and achievements..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </Card>

          {/* Stored Reusable Application Questionnaire Answers */}
          <Card className="p-5 border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                Stored Application Questionnaire Answers (Section 12 & 29)
              </h3>
              <span className="text-[11px] text-slate-400">Reused across forms</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Work Authorization</label>
                <input
                  type="text"
                  value={applicationAnswers.workAuthorization}
                  onChange={(e) =>
                    setApplicationAnswers({ ...applicationAnswers, workAuthorization: e.target.value })
                  }
                  placeholder="e.g. Yes, authorized to work"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Visa Sponsorship Requirement</label>
                <select
                  value={applicationAnswers.requiresSponsorship ? 'yes' : 'no'}
                  onChange={(e) =>
                    setApplicationAnswers({
                      ...applicationAnswers,
                      requiresSponsorship: e.target.value === 'yes',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                >
                  <option value="no">No, will not require sponsorship</option>
                  <option value="yes">Yes, will require sponsorship</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notice Period / Availability</label>
                <input
                  type="text"
                  value={applicationAnswers.noticePeriod}
                  onChange={(e) =>
                    setApplicationAnswers({ ...applicationAnswers, noticePeriod: e.target.value })
                  }
                  placeholder="e.g. Immediate / 15 Days"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Expected Salary / Compensation</label>
                <input
                  type="text"
                  value={applicationAnswers.expectedSalary}
                  onChange={(e) =>
                    setApplicationAnswers({ ...applicationAnswers, expectedSalary: e.target.value })
                  }
                  placeholder="e.g. $90,000 / Competitive"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Willingness to Relocate</label>
                <input
                  type="text"
                  value={applicationAnswers.willingToRelocate}
                  onChange={(e) =>
                    setApplicationAnswers({ ...applicationAnswers, willingToRelocate: e.target.value })
                  }
                  placeholder="e.g. Yes / Open to discussion"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Preferred Work Mode</label>
                <input
                  type="text"
                  value={applicationAnswers.preferredWorkMode}
                  onChange={(e) =>
                    setApplicationAnswers({ ...applicationAnswers, preferredWorkMode: e.target.value })
                  }
                  placeholder="e.g. Remote / Hybrid / On-site"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>
            </div>

            {/* Custom Q&A list */}
            {applicationAnswers.customAnswers && applicationAnswers.customAnswers.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800">Saved Custom Application Answers</h4>
                {applicationAnswers.customAnswers.map((ca) => (
                  <div
                    key={ca.questionKey}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 block">{ca.questionText || ca.questionKey}</span>
                      <span className="text-slate-600 mt-0.5 block">{ca.answerText}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomAnswer(ca.questionKey)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                      title="Remove answer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Q&A */}
            <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/50 p-3 rounded-lg border border-dashed border-slate-200">
              <span className="text-xs font-bold text-slate-800 block mb-2">Teach AI an Application Answer</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-2">
                <input
                  type="text"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="Key (e.g. years_node_js, gpa, security_clearance)"
                  className="px-2.5 py-1.5 rounded border border-slate-300 text-xs outline-none bg-white"
                />
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Question text (e.g. How many years of Node.js experience?)"
                  className="px-2.5 py-1.5 rounded border border-slate-300 text-xs outline-none bg-white"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAnswer}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  placeholder="Your verified truthful answer"
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs outline-none bg-white"
                />
                <Button
                  size="xs"
                  onClick={handleAddCustomAnswer}
                  className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  <Plus className="w-3 h-3 mr-1" /> Save
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Links & Skills Sidebar */}
        <div className="space-y-6">
          {/* Online Links */}
          <Card className="p-5 border-slate-200 bg-white">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <FolderGit2 className="w-4 h-4 text-blue-600" />
              Professional Links
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">LinkedIn Profile</label>
                <input
                  type="url"
                  value={links.linkedin}
                  onChange={(e) => setLinks({ ...links, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">GitHub Profile</label>
                <input
                  type="url"
                  value={links.github}
                  onChange={(e) => setLinks({ ...links, github: e.target.value })}
                  placeholder="https://github.com/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Portfolio / Personal Site</label>
                <input
                  type="url"
                  value={links.portfolio}
                  onChange={(e) => setLinks({ ...links, portfolio: e.target.value })}
                  placeholder="https://myportfolio.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-xs outline-none"
                />
              </div>
            </div>
          </Card>

          {/* Technical Skills */}
          <Card className="p-5 border-slate-200 bg-white">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-blue-600" />
              Verified Candidate Skills
            </h3>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                placeholder="Add skill (e.g. React, Docker)"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs outline-none"
              />
              <Button size="xs" onClick={handleAddSkill} className="text-xs cursor-pointer">
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {skills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(s)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer text-[10px]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
