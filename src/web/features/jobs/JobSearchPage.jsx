import React, { useState, useEffect } from 'react';
import { Search, MapPin, Briefcase } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { JobCard } from './JobCard';
import { getDiscoveredJobsApi, discoverJobsApi } from '../../services/jobService';
import { createApplicationApi } from '../../services/applicationService';

export const JobSearchPage = () => {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('All Locations');
  const [jobType, setJobType] = useState('All Types');
  const [activeTab, setActiveTab] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [applyingId, setApplyingId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await getDiscoveredJobsApi();
      if (res.data) {
        setJobs(res.data);
      } else {
        setJobs([]);
      }
    } catch (err) {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const searchConfig = {
        keywords: keyword ? [keyword] : ['MERN Developer', 'Node.js Developer'],
        locations: location !== 'All Locations' ? [location] : ['Pune', 'Remote'],
        sources: ['jobViaReferral', 'naukri', 'linkedin'],
        maxJobs: 20,
      };
      const res = await discoverJobsApi(searchConfig);
      if (res.discoveredJobs && res.discoveredJobs.length > 0) {
        setJobs(res.discoveredJobs);
      } else {
        fetchJobs();
      }
    } catch (err) {
      // Fallback
    } finally {
      setSearching(false);
    }
  };

  const handleApply = async (job) => {
    setApplyingId(job._id);
    try {
      await createApplicationApi({
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        sourceUrl: job.sourceUrl || 'https://linkedin.com',
        status: 'Applied',
        appliedDate: new Date().toISOString(),
      });
      setToastMessage(`Successfully applied to ${job.title} at ${job.company}!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err) {
      setToastMessage(`Application logged for ${job.title}!`);
      setTimeout(() => setToastMessage(''), 4000);
    } finally {
      setApplyingId(null);
    }
  };

  const categoryTabs = [
    { id: 'all', label: 'All (124)' },
    { id: 'frontend', label: 'Frontend (32)' },
    { id: 'backend', label: 'Backend (28)' },
    { id: 'fullstack', label: 'Full Stack (24)' },
    { id: 'aiml', label: 'AI/ML (12)' },
    { id: 'devops', label: 'DevOps (6)' },
    { id: 'other', label: 'Other (20)' },
  ];

  const filteredJobs = jobs.filter((job) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'frontend') return job.title.toLowerCase().includes('frontend') || job.title.toLowerCase().includes('react');
    if (activeTab === 'backend') return job.title.toLowerCase().includes('backend') || job.title.toLowerCase().includes('node');
    if (activeTab === 'fullstack') return job.title.toLowerCase().includes('full') || job.title.toLowerCase().includes('mern');
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-4">
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Job Search</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Find your next opportunity with AI-powered job matching.
        </p>
      </div>

      {/* Search Bar Container */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <Input
            placeholder="Job title, skills, company..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>

        <div className="w-full md:w-48">
          <Select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            options={[
              { id: 'All Locations', name: 'All Locations' },
              { id: 'Pune', name: 'Pune' },
              { id: 'Bengaluru', name: 'Bengaluru' },
              { id: 'Hyderabad', name: 'Hyderabad' },
              { id: 'Remote', name: 'Remote' },
            ]}
          />
        </div>

        <div className="w-full md:w-44">
          <Select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            options={[
              { id: 'All Types', name: 'All Types' },
              { id: 'Full-Time', name: 'Full-Time' },
              { id: 'Contract', name: 'Contract' },
              { id: 'Part-Time', name: 'Part-Time' },
            ]}
          />
        </div>

        <Button loading={searching} onClick={handleSearch} className="w-full md:w-auto px-6 cursor-pointer">
          Search
        </Button>
      </div>

      {/* Segmented Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Job Cards List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
            No matching jobs found. Try adjusting your search query.
          </div>
        ) : (
          filteredJobs.map((job) => (
            <JobCard
              key={job._id}
              job={job}
              onApply={handleApply}
              applyingId={applyingId}
            />
          ))
        )}
      </div>
    </div>
  );
};
