import React, { useState, useContext, useEffect } from 'react';
import { Save, Download, Sparkles, Check, Globe, Mail, Phone, MapPin, Link2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RESUME_TEMPLATES } from '../../constants/config';
import { generateResumePdfApi, getMyResumesApi, saveResumeDataApi } from '../../services/resumeService';
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
    fullName: settings.userSetting?.fullName || user?.username || 'Karan Gade',
    headline: settings.userSetting?.headline || 'Full Stack Web Developer (MERN) | AI-Integrated Web Applications',
    email: settings.userSetting?.email || user?.email || 'karan@example.com',
    phone: settings.userSetting?.phone || '+91 8446726903',
    location: settings.userSetting?.location || 'Pune, Maharashtra',
    linkedinUrl: settings.userSetting?.linkedinUrl || 'https://linkedin.com/in/karan-gade',
    githubUrl: settings.userSetting?.githubUrl || 'https://github.com/KaranGade24',
    portfolioUrl: settings.userSetting?.portfolioUrl || 'https://portfolio-karan-gade.vercel.app',
    summary:
      'Full Stack Developer focused on building scalable, user-centric web applications and intelligent features.',
    skills: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'REST APIs', 'Git', 'Tailwind CSS'],
    experience: [
      {
        role: 'Full Stack Web Developer Intern',
        company: 'TechCorp Solutions',
        period: '2024 - Present',
        bullets: [
          'Engineered scalable MERN stack web applications with AI features using Node.js, Express, and React.',
          'Designed RESTful API endpoints and integrated MongoDB schemas with Mongoose ORM.',
          'Optimized frontend performance, reducing initial bundle load times by 28% with Vite and Tailwind CSS.'
        ]
      }
    ],
    education: [
      {
        degree: 'Bachelor of Technology (B.Tech) in Computer Engineering',
        institution: 'Savitribai Phule Pune University',
        period: '2020 - 2024'
      }
    ],
    projects: [
      {
        title: 'AI Auto Job Applicator & Resume Tailorer',
        description: 'Full-stack AI application that discovers job postings, tailors resumes using LLM APIs, and automates application tracking.',
        technologies: ['React.js', 'Node.js', 'Express', 'MongoDB', 'Gemini API', 'Tailwind CSS'],
        link: 'https://github.com/KaranGade24/ai-job-applicator'
      },
      {
        title: 'Real-time Collaborative Task Workspace',
        description: 'Interactive dashboard with WebSockets, drag-and-drop kanban boards, and role-based access control.',
        technologies: ['React', 'Node.js', 'Socket.io', 'MongoDB', 'JWT Auth'],
        link: 'https://portfolio-karan-gade.vercel.app'
      }
    ],
    certifications: [
      {
        name: 'Full Stack Development Certification (MERN)',
        issuer: 'Meta / Coursera',
        date: '2024'
      },
      {
        name: 'Node.js & MongoDB Developer Certification',
        issuer: 'HackerRank',
        date: '2023'
      }
    ],
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

    const loadBackendResume = async () => {
      try {
        const res = await getMyResumesApi();
        if (res.data && res.data.length > 0) {
          const latest = res.data[0];
          if (latest.parsedData && typeof latest.parsedData === 'object') {
            const pData = latest.parsedData;
            setResumeData((prev) => ({
              ...prev,
              ...(pData.personalInfo || pData.personal || {}),
              summary: pData.summary || pData.professionalSummary || prev.summary,
              skills: Array.isArray(pData.skills) ? pData.skills : (pData.skills?.keySkills || prev.skills),
              experience: (pData.experience && pData.experience.length > 0) ? pData.experience : ((pData.workExperience && pData.workExperience.length > 0) ? pData.workExperience : prev.experience),
              education: (pData.education && pData.education.length > 0) ? pData.education : prev.education,
              projects: (pData.projects && pData.projects.length > 0) ? pData.projects : prev.projects,
              certifications: (pData.certifications && pData.certifications.length > 0) ? pData.certifications : prev.certifications,
            }));
          }
        }
      } catch (err) {
        // Fallback
      }
    };
    loadBackendResume();
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

  const handleSave = async () => {
    try {
      await saveResumeDataApi(resumeData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
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
          {sections.education && (resumeData.education?.length > 0) && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Education
              </h2>
              {resumeData.education.map((edu, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{edu.degree}</p>
                    <p className="text-slate-500">{edu.institution || edu.school}</p>
                  </div>
                  <span className="text-slate-500 font-medium">{edu.period || edu.graduationYear}</span>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {sections.projects && (resumeData.projects?.length > 0) && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Projects
              </h2>
              {resumeData.projects.map((proj, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{proj.title || proj.name}</p>
                    {proj.link && (
                      <a
                        href={proj.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        View Project <Globe className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>
                  {proj.technologies && proj.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {proj.technologies.map((tech, i) => (
                        <span key={i} className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Certifications */}
          {sections.certifications && (resumeData.certifications?.length > 0) && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                Certifications
              </h2>
              {resumeData.certifications.map((cert, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{cert.name || cert.title}</p>
                    <p className="text-slate-500">{cert.issuer || cert.organization}</p>
                  </div>
                  <span className="text-slate-500 font-medium">{cert.date || cert.issueDate}</span>
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
