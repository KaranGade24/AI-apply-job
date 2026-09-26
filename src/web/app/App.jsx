import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { NaukriProvider } from '../context/NaukriContext';
import { AppRouter } from './router';

export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <NaukriProvider>
          <AppRouter />
        </NaukriProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
