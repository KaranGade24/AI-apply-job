import React, { useState, useEffect, useContext, useRef } from 'react';
import { Search, MapPin, Briefcase, Check, X, Plus } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { JobCard } from './JobCard';
import { ApplicationReviewModal } from '../applications/ApplicationReviewModal';
import { getDiscoveredJobsApi, discoverJobsApi, deleteJobApi } from '../../services/jobService';
import { createApplicationApi } from '../../services/applicationService';
import { getNaukriStatusApi } from '../../services/naukriService';
import { NaukriConnectModal } from '../naukri/NaukriConnectModal';
import { SettingsContext } from '../../context/SettingsContext';

const AVAILABLE_LOCATIONS = ['Pune', 'Bengaluru', 'Hyderabad', 'Mumbai', 'Remote', 'Delhi NCR', 'Chennai'];

export const JobSearchPage = () => {
  const { settings } = useContext(SettingsContext);

  const [keyword, setKeyword] = useState('');
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [minExp, setMinExp] = useState(0);
  const [maxExp, setMaxExp] = useState(2);
  const [scrapeLimit, setScrapeLimit] = useState(20);
  const [jobType, setJobType] = useState('All Types');
  const [activeTab, setActiveTab] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [applyingId, setApplyingId] = useState(null);
  const [reviewingJob, setReviewingJob] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [selectedSources, setSelectedSources] = useState(['naukri', 'jobViaReferral']);
  const [excludeKeywords, setExcludeKeywords] = useState('Senior, Lead, Manager');
  const [naukriStatus, setNaukriStatus] = useState(null);
  const [isNaukriModalOpen, setIsNaukriModalOpen] = useState(false);

  const abortControllerRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const fetchNaukriStatus = async () => {
    try {
      const res = await getNaukriStatusApi();
      if (res.data) setNaukriStatus(res.data);
    } catch {
      // ignore
    }
  };

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

  const handleDeleteJob = async (jobId) => {
    try {
      await deleteJobApi(jobId);
      setJobs(jobs.filter((j) => j._id !== jobId));
      showToast('Job removed from search results');
    } catch (err) {
      console.error('Delete job error:', err);
      showToast('Failed to delete job');
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchNaukriStatus();
  }, []);

  useEffect(() => {
    if (settings.jobSetting) {
      if (!keyword && settings.jobSetting.keywords?.length > 0) {
        setKeyword(settings.jobSetting.keywords.join(', '));
      }
      if (selectedLocations.length === 0 && settings.jobSetting.locations?.length > 0) {
        setSelectedLocations(settings.jobSetting.locations);
      }
      setMinExp(settings.jobSetting.minExp ?? 0);
      setMaxExp(settings.jobSetting.maxExp ?? 2);
      setScrapeLimit(settings.jobSetting.maxJobsToSearch ?? 20);
    }
  }, [settings.jobSetting]);

  const handleCancelSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSearching(false);
    // Reset filters and active search state upon user stop
    setKeyword('');
    setSelectedLocations([]);
    setMinExp(settings.jobSetting?.minExp ?? 0);
    setMaxExp(settings.jobSetting?.maxExp ?? 2);
    setScrapeLimit(settings.jobSetting?.maxJobsToSearch ?? 20);
    showToast('Search canceled and filters reset.');
  };

  const handleSearch = async () => {
    // If Naukri is selected and not connected, prompt user immediately
    if (selectedSources.includes('naukri') && !naukriStatus?.connected) {
      setIsNaukriModalOpen(true);
      showToast('Naukri session is required to search on Naukri. Please connect your account.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSearching(true);
    try {
      const parsedKeywords = keyword
        ? keyword.split(',').map((k) => k.trim()).filter(Boolean)
        : settings.jobSetting?.keywords || [];

      const parsedExclude = excludeKeywords
        ? excludeKeywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [];

      const searchConfig = {
        keywords: parsedKeywords,
        locations: selectedLocations.length > 0 ? selectedLocations : (settings.jobSetting?.locations || []),
        sources: selectedSources.length > 0 ? selectedSources : ['jobViaReferral'],
        experience: { min: Number(minExp), max: Number(maxExp) },
        excludeKeywords: parsedExclude,
        maxJobs: Number(scrapeLimit),
      };

      const res = await discoverJobsApi(searchConfig, { signal: controller.signal });
      if (res.data?.jobs && res.data.jobs.length > 0) {
        setJobs(res.data.jobs);
        showToast(`Discovered & matched ${res.data.jobs.length} jobs.`);
      } else if (res.jobs && res.jobs.length > 0) {
        setJobs(res.jobs);
        showToast(`Discovered & matched ${res.jobs.length} jobs.`);
      } else {
        fetchJobs();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Search operation canceled by user.');
      } else {
        const errorMsg = err.response?.data?.message || err.message;
        if (errorMsg?.includes('NAUKRI_AUTHENTICATION_REQUIRED') || errorMsg?.includes('Naukri session')) {
          setIsNaukriModalOpen(true);
          showToast('Naukri session expired or required. Please reconnect.');
        } else {
          showToast(errorMsg || 'Failed to discover jobs.');
        }
        fetchJobs();
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setSearching(false);
    }
  };

  const handleApply = (job) => {
    setReviewingJob(job);
  };

  const toggleLocation = (loc) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter((l) => l !== loc));
    } else {
      setSelectedLocations([...selectedLocations, loc]);
    }
  };

  const handleAddCustomLocation = (e) => {
    if (e.key === 'Enter' && customLocationInput.trim()) {
      e.preventDefault();
      const loc = customLocationInput.trim();
      if (!selectedLocations.includes(loc)) {
        setSelectedLocations([...selectedLocations, loc]);
      }
      setCustomLocationInput('');
    }
  };

  // Dynamic category calculations from real jobs
  const frontendCount = jobs.filter((j) =>
    /frontend|react|vue|angular|ui|web/i.test(j.title) || (j.skills && j.skills.some((s) => /react|frontend|ui/i.test(s)))
  ).length;

  const backendCount = jobs.filter((j) =>
    /backend|node|express|python|java|api/i.test(j.title) || (j.skills && j.skills.some((s) => /node|express|backend/i.test(s)))
  ).length;

  const fullstackCount = jobs.filter((j) =>
    /full\s*stack|mern|mean|software/i.test(j.title) || (j.skills && j.skills.some((s) => /mern|fullstack/i.test(s)))
  ).length;

  const aimlCount = jobs.filter((j) =>
    /ai|ml|machine|genai|llm|python/i.test(j.title) || (j.skills && j.skills.some((s) => /ai|llm|gemini|python/i.test(s)))
  ).length;

  const devopsCount = jobs.filter((j) =>
    /devops|cloud|aws|docker|kubernetes/i.test(j.title) || (j.skills && j.skills.some((s) => /docker|aws|devops/i.test(s)))
  ).length;

  const knownCategorizedCount = frontendCount + backendCount + fullstackCount + aimlCount + devopsCount;
  const otherCount = Math.max(0, jobs.length - knownCategorizedCount);

  const categoryTabs = [
    { id: 'all', label: `All (${jobs.length})` },
    { id: 'frontend', label: `Frontend (${frontendCount})` },
    { id: 'backend', label: `Backend (${backendCount})` },
    { id: 'fullstack', label: `Full Stack (${fullstackCount})` },
    { id: 'aiml', label: `AI/ML (${aimlCount})` },
    { id: 'devops', label: `DevOps (${devopsCount})` },
    { id: 'other', label: `Other (${otherCount})` },
  ];

  const filteredJobs = jobs.filter((job) => {
    // 1. Category Tab Filter
    let matchesCategory = true;
    if (activeTab === 'frontend') {
      matchesCategory = /frontend|react|vue|angular|ui|web/i.test(job.title) || (job.skills && job.skills.some((s) => /react|frontend|ui/i.test(s)));
    } else if (activeTab === 'backend') {
      matchesCategory = /backend|node|express|python|java|api/i.test(job.title) || (job.skills && job.skills.some((s) => /node|express|backend/i.test(s)));
    } else if (activeTab === 'fullstack') {
      matchesCategory = /full\s*stack|mern|mean|software/i.test(job.title) || (job.skills && job.skills.some((s) => /mern|fullstack/i.test(s)));
    } else if (activeTab === 'aiml') {
      matchesCategory = /ai|ml|machine|genai|llm|python/i.test(job.title) || (job.skills && job.skills.some((s) => /ai|llm|gemini|python/i.test(s)));
    } else if (activeTab === 'devops') {
      matchesCategory = /devops|cloud|aws|docker|kubernetes/i.test(job.title) || (job.skills && job.skills.some((s) => /docker|aws|devops/i.test(s)));
    }

    // 2. Multi Location Filter
    let matchesLocation = true;
    if (selectedLocations.length > 0) {
      matchesLocation = selectedLocations.some((loc) =>
        job.location?.toLowerCase().includes(loc.toLowerCase())
      );
    }

    return matchesCategory && matchesLocation;
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Keyword Search Input */}
          <div className="flex-1 w-full">
            <Input
              placeholder="Job title, skills, company (e.g. MERN, Node.js)..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          {/* Multi-Location Selection Dropdown trigger */}
          <div className="relative w-full md:w-72">
            <button
              type="button"
              onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                {selectedLocations.length === 0
                  ? 'All Locations'
                  : `${selectedLocations.length} Location${selectedLocations.length > 1 ? 's' : ''} Selected`}
              </span>
              <span className="text-slate-400 text-[10px]">▼</span>
            </button>

            {/* Location Multi-Select Popover */}
            {isLocationDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-30 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Select Locations</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {AVAILABLE_LOCATIONS.map((loc) => {
                    const isSelected = selectedLocations.includes(loc);
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => toggleLocation(loc)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>{loc}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    placeholder="Type custom location & press Enter..."
                    value={customLocationInput}
                    onChange={(e) => setCustomLocationInput(e.target.value)}
                    onKeyDown={handleAddCustomLocation}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Job Type Select */}
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

          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <Button loading={searching} onClick={handleSearch} className="w-full md:w-auto px-6 cursor-pointer">
              Search
            </Button>

            {searching && (
              <Button
                variant="outline"
                onClick={handleCancelSearch}
                className="w-full md:w-auto px-4 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-semibold cursor-pointer"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Job Sources & Advanced Filters */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          {/* Source Selector Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Job Sources:</span>
              
              {/* Naukri Source Pill */}
              <button
                type="button"
                onClick={() => {
                  if (selectedSources.includes('naukri')) {
                    setSelectedSources(selectedSources.filter((s) => s !== 'naukri'));
                  } else {
                    setSelectedSources([...selectedSources, 'naukri']);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  selectedSources.includes('naukri')
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>Naukri</span>
                {naukriStatus?.connected ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Connected" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="Session required" />
                )}
              </button>

              {/* JobViaReferral Source Pill */}
              <button
                type="button"
                onClick={() => {
                  if (selectedSources.includes('jobViaReferral')) {
                    setSelectedSources(selectedSources.filter((s) => s !== 'jobViaReferral'));
                  } else {
                    setSelectedSources([...selectedSources, 'jobViaReferral']);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  selectedSources.includes('jobViaReferral')
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>Referral Portal</span>
              </button>
            </div>

            {/* Quick Naukri Session Manager Trigger */}
            <button
              type="button"
              onClick={() => setIsNaukriModalOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              {naukriStatus?.connected ? '✓ Naukri Session Active (Manage)' : '⚠️ Connect Naukri Session'}
            </button>
          </div>

          {/* Exclude Keywords and Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Exclude Keywords:</span>
              <input 
                type="text" 
                placeholder="Senior, Lead, Manager (comma separated)..."
                value={excludeKeywords} 
                onChange={(e) => setExcludeKeywords(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Exp Range:</span>
              <input 
                type="number" 
                title="Min Experience"
                value={minExp} 
                onChange={(e) => setMinExp(e.target.value)}
                className="w-1/2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input 
                type="number" 
                title="Max Experience"
                value={maxExp} 
                onChange={(e) => setMaxExp(e.target.value)}
                className="w-1/2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Scrape Limit:</span>
              <input 
                type="number" 
                value={scrapeLimit} 
                onChange={(e) => setScrapeLimit(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Selected Locations Pills Bar */}
        {selectedLocations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Active Locations:</span>
            {selectedLocations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold"
              >
                {loc}
                <button
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className="hover:text-blue-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelectedLocations([])}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}
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
            No matching jobs found. Try adjusting your search query or location filter.
          </div>
        ) : (
          filteredJobs.map((job) => (
            <JobCard
              key={job._id}
              job={job}
              onApply={handleApply}
              onReview={handleApply}
              onDelete={handleDeleteJob}
              applyingId={applyingId}
            />
          ))
        )}
      </div>

      {/* Application Verification & Review Modal */}
      {reviewingJob && (
        <ApplicationReviewModal
          isOpen={!!reviewingJob}
          job={reviewingJob}
          onClose={() => setReviewingJob(null)}
          onApplicationUpdated={fetchJobs}
        />
      )}

      {/* Naukri Session Modal */}
      <NaukriConnectModal
        isOpen={isNaukriModalOpen}
        onClose={() => setIsNaukriModalOpen(false)}
        onStatusChange={(data) => {
          setNaukriStatus(data);
          fetchJobs();
        }}
      />
    </div>
  );
};
