import React, { useState, useContext, useEffect } from 'react';
import { Save, Download, Sparkles, Check, Globe, Mail, Phone, MapPin, Link2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RESUME_TEMPLATES } from '../../constants/config';
import { generateResumePdfApi } from '../../services/resumeService';
import { ResumePreviewModal } from './ResumePreviewModal';
import { SettingsContext } from '../../context/SettingsContext';
import { useAuth } from '../../hooks/useAuth';

export const ResumeBuilderPage = () => {
  const { user } = useAuth();
  const { settings } = useContext(SettingsContext);

  const [selectedTemplate, setSelectedTemplate] = useState('ATS Modern');
  const [sections, setSections] = useState({
    header: true,
    summary: true,
    skills: true,
    experience: true,
    education: true,
    projects: true,
    certifications: true,
  });

  const [resumeData, setResumeData] = useState({
    fullName: settings.userSetting?.fullName || user?.username || '',
    headline: settings.userSetting?.headline || 'Full Stack Web Developer',
    email: settings.userSetting?.email || user?.email || '',
    phone: settings.userSetting?.phone || '',
    location: settings.userSetting?.location || '',
    linkedinUrl: settings.userSetting?.linkedinUrl || '',
    githubUrl: settings.userSetting?.githubUrl || '',
    portfolioUrl: settings.userSetting?.portfolioUrl || '',
    summary:
      'Full Stack Developer focused on building scalable, user-centric web applications and intelligent features.',
    skills: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'REST APIs', 'Git'],
    experience: [],
    education: [],
  });

  useEffect(() => {
    if (settings.userSetting || user) {
      setResumeData((prev) => ({
        ...prev,
        fullName: settings.userSetting?.fullName || user?.username || prev.fullName,
        headline: settings.userSetting?.headline || prev.headline,
        email: settings.userSetting?.email || user?.email || prev.email,
        phone: settings.userSetting?.phone || prev.phone,
        location: settings.userSetting?.location || prev.location,
        linkedinUrl: settings.userSetting?.linkedinUrl || prev.linkedinUrl,
        githubUrl: settings.userSetting?.githubUrl || prev.githubUrl,
        portfolioUrl: settings.userSetting?.portfolioUrl || prev.portfolioUrl,
      }));
    }
  }, [settings, user]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleSection = (key) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGeneratePdf = async () => {
    setPdfLoading(true);
    try {
      const res = await generateResumePdfApi(resumeData, selectedTemplate);
      if (res.pdfUrl) {
        setPdfUrl(res.pdfUrl);
      }
      setIsPreviewOpen(true);
    } catch (err) {
      setIsPreviewOpen(true);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Resume Builder</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create a professional resume tailored to your profile and target job.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} className="gap-2 cursor-pointer">
            {saveSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
            {saveSuccess ? 'Saved!' : 'Save'}
          </Button>

          <Button loading={pdfLoading} onClick={handleGeneratePdf} className="gap-2 cursor-pointer">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Template Selection & Section Toggles (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Choose Template Card */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Choose Template</h2>
            <div className="space-y-2.5">
              {RESUME_TEMPLATES.map((tmpl) => (
                <label
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedTemplate === tmpl.id
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="resumeTemplate"
                    checked={selectedTemplate === tmpl.id}
                    onChange={() => setSelectedTemplate(tmpl.id)}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{tmpl.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{tmpl.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          {/* Sections Toggle Card */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Sections</h2>
            <div className="space-y-2">
              {[
                { key: 'header', label: 'Header' },
                { key: 'summary', label: 'Professional Summary' },
                { key: 'skills', label: 'Key Skills' },
                { key: 'experience', label: 'Experience' },
                { key: 'education', label: 'Education' },
                { key: 'projects', label: 'Projects' },
                { key: 'certifications', label: 'Certifications' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggleSection(key)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Resume Canvas (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-8 shadow-xs min-h-[700px] space-y-6">
          <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-widest border-b pb-2">Your Resume</div>

          {/* Header */}
          {sections.header && (
            <div className="border-b border-slate-200 pb-5 space-y-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{resumeData.fullName}</h1>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">{resumeData.headline}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {resumeData.email}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {resumeData.phone}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {resumeData.location}</span>
                <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5 text-slate-400" /> {resumeData.linkedinUrl}</span>
                <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5 text-slate-400" /> {resumeData.githubUrl}</span>
                <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-slate-400" /> {resumeData.portfolioUrl}</span>
              </div>
            </div>
          )}

          {/* Professional Summary */}
          {sections.summary && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Professional Summary
              </h2>
              <p className="text-xs text-slate-700 leading-relaxed">
                {resumeData.summary}
              </p>
            </div>
          )}

          {/* Key Skills */}
          {sections.skills && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Key Skills
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {resumeData.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-semibold text-slate-800"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Work Experience */}
          {sections.experience && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Work Experience
              </h2>
              {resumeData.experience.map((exp, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{exp.role} <span className="font-normal text-slate-500">· {exp.company}</span></p>
                    <span className="text-xs text-slate-500 font-medium">{exp.period}</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-1">
                    {exp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Education */}
          {sections.education && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Education
              </h2>
              {resumeData.education.map((edu, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{edu.degree}</p>
                    <p className="text-slate-500">{edu.institution}</p>
                  </div>
                  <span className="text-slate-500 font-medium">{edu.period}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview */}
      <ResumePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfUrl={pdfUrl}
        template={selectedTemplate}
        onChangeTemplate={() => setIsPreviewOpen(false)}
        resumeData={resumeData}
      />
    </div>
  );
};
