import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AppRouter } from './router';

export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppRouter />
      </SettingsProvider>
    </AuthProvider>
  );
}
