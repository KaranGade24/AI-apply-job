import React from 'react';
import { Download, Share2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

export const ResumePreviewModal = ({
  isOpen,
  onClose,
  pdfUrl,
  template = 'ATS Modern',
  onChangeTemplate,
  resumeData,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Resume Preview" maxWidth="max-w-5xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left PDF Preview Canvas */}
        <div className="lg:col-span-2 bg-slate-100 rounded-xl p-4 border border-slate-200 min-h-[500px] flex items-center justify-center">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-[550px] rounded-lg shadow-sm border border-slate-200"
              title="Resume PDF Preview"
            />
          ) : (
            <div className="bg-white p-8 rounded-lg shadow-sm w-full max-w-md text-slate-800 space-y-4 border border-slate-200">
              <div className="border-b pb-4">
                <h2 className="text-xl font-bold">{resumeData?.fullName || 'Karan Gade'}</h2>
                <p className="text-xs text-slate-600 font-semibold">{resumeData?.headline || 'Full Stack Web Developer (MERN)'}</p>
                <p className="text-[11px] text-slate-500 mt-1">{resumeData?.email || 'karan@example.com'} · {resumeData?.phone || '+91 98765 43210'}</p>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Professional Summary</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {resumeData?.summary || 'Full Stack MERN Developer focused on building scalable and intelligent web applications using React.js, Node.js, Express.js, MongoDB and AI APIs.'}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">Key Skills</h3>
                <div className="flex flex-wrap gap-1">
                  {['JavaScript', 'React.js', 'Node.js', 'MongoDB', 'Express.js', 'REST APIs', 'JWT', 'Socket.IO'].map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-slate-100 text-[11px] rounded border border-slate-200 text-slate-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Action Sidebar */}
        <div className="space-y-6">
          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Your resume is ready!
            </h3>
            <p className="text-xs text-slate-500 mt-1">Download it as a clean, ATS-formatted PDF.</p>

            <div className="mt-4 space-y-2">
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download="Tailored_Resume.pdf"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </a>
              )}

              <Button variant="outline" className="w-full justify-center text-xs">
                <Share2 className="w-4 h-4" /> Share Link
              </Button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
            <p className="text-xs font-medium text-slate-500">Template Used</p>
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-sm font-bold text-slate-900">{template}</span>
              <Button size="sm" variant="ghost" onClick={onChangeTemplate} className="text-xs">
                Change Template
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-500 mb-3">Need Changes? Go back to the Resume Builder to make edits.</p>
            <Button variant="outline" size="sm" onClick={onClose} className="w-full justify-center">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Editor
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
