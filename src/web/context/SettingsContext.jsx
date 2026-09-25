import React, { createContext, useState, useEffect, useContext } from 'react';
import { getSettingsApi, updateSettingsApi } from '../services/settingsService';
import { AuthContext } from './AuthContext';

export const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;

  const [settings, setSettings] = useState({
    aiSettings: {
      provider: 'googleGemini',
      model: 'gemini-1.5-flash',
      temperature: 0.1,
      apiKey: '',
    },
    userSetting: {
      fullName: user?.username || '',
      email: user?.email || '',
      phone: '',
      location: '',
      portfolioUrl: '',
      githubUrl: '',
      linkedinUrl: '',
      headline: '',
    },
    jobSetting: {
      defaultSources: ['jobViaReferral', 'naukri', 'linkedin'],
      keywords: [],
      locations: [],
      minExp: 0,
      maxExp: 10,
      maxJobsToSearch: 20,
      searchMode: 'byQuery',
      workMode: ['remote', 'hybrid', 'workFromOffice'],
      employmentType: ['fullTime'],
      preferredApplicationMethods: ['email', 'googleForm', 'websiteForm', 'phone', 'unknown'],
    },
    applicationSetting: {
      autoApplyEnabled: false,
      maxDailyApplications: 20,
      notifyOnStatusChange: true,
      preferredEmail: user?.email || '',
    },
    resumeSetting: {
      defaultTemplate: 'ATS Modern',
      targetPages: 1,
      sections: {
        header: true,
        summary: true,
        skills: true,
        experience: true,
        education: true,
        projects: true,
        certifications: true,
      },
    },
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      getSettingsApi()
        .then((res) => {
          if (res.data) {
            setSettings((prev) => ({
              ...prev,
              ...res.data,
              userSetting: {
                fullName: res.data.userSetting?.fullName || user.username || '',
                email: res.data.userSetting?.email || user.email || '',
                phone: res.data.userSetting?.phone || '',
                location: res.data.userSetting?.location || '',
                portfolioUrl: res.data.userSetting?.portfolioUrl || '',
                githubUrl: res.data.userSetting?.githubUrl || '',
                linkedinUrl: res.data.userSetting?.linkedinUrl || '',
                headline: res.data.userSetting?.headline || '',
              },
            }));
          }
        })
        .catch(() => {
          // Defaults
        });
    }
  }, [user]);

  const updateSettings = async (newSettings) => {
    setLoading(true);
    try {
      const res = await updateSettingsApi(newSettings);
      if (res.data) {
        setSettings(res.data);
      } else {
        setSettings(newSettings);
      }
      return res;
    } catch (err) {
      setSettings(newSettings);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
