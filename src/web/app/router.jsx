import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Layout } from '../components/layout/Layout';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { JobSearchPage } from '../features/jobs/JobSearchPage';
import { ApplicationsPage } from '../features/applications/ApplicationsPage';
import { ResumeBuilderPage } from '../features/resume/ResumeBuilderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AiSettingsTab } from '../features/settings/aiSettings/AiSettingsTab';
import { UserSettingTab } from '../features/settings/userSetting/UserSettingTab';
import { JobSettingTab } from '../features/settings/jobSetting/JobSettingTab';
import { ApplicationSettingTab } from '../features/settings/applicationSetting/ApplicationSettingTab';
import { ResumeSettingTab } from '../features/settings/resumeSetting/ResumeSettingTab';

const ProtectedLayout = () => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout />;
};

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected App Routes */}
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobSearchPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/resume" element={<ResumeBuilderPage />} />

          {/* Settings Sub-routes */}
          <Route path="/settings" element={<SettingsPage />}>
            <Route path="ai" element={<AiSettingsTab />} />
            <Route path="user" element={<UserSettingTab />} />
            <Route path="job" element={<JobSettingTab />} />
            <Route path="application" element={<ApplicationSettingTab />} />
            <Route path="resume" element={<ResumeSettingTab />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
