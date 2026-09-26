import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getNaukriStatusApi, connectNaukriApi, disconnectNaukriApi } from '../services/naukriService';
import { useAuth } from '../hooks/useAuth';
import { NaukriConnectModal } from '../features/naukri/NaukriConnectModal';

export const NaukriContext = createContext(null);

export const NaukriProvider = ({ children }) => {
  const { token } = useAuth();
  const [naukriStatus, setNaukriStatusState] = useState({
    connected: false,
    status: 'disconnected',
    userName: '',
    userEmail: '',
    lastValidatedAt: null
  });
  const [loading, setLoading] = useState(false);
  const [isNaukriModalOpen, setIsNaukriModalOpen] = useState(false);
  const [postConnectCallback, setPostConnectCallback] = useState(null);

  const isConnected = Boolean(
    naukriStatus?.connected === true ||
    naukriStatus?.status === 'connected' ||
    naukriStatus?.authenticated === true
  );

  const refreshNaukriStatus = useCallback(async () => {
    if (!token) return { connected: false, status: 'disconnected' };
    try {
      setLoading(true);
      const res = await getNaukriStatusApi();
      const data = res?.data || res || {};
      const statusNormalized = {
        connected: Boolean(data.connected === true || data.status === 'connected'),
        status: data.status || (data.connected ? 'connected' : 'disconnected'),
        userName: data.userName || '',
        userEmail: data.userEmail || '',
        lastValidatedAt: data.lastValidatedAt || null
      };
      setNaukriStatusState(statusNormalized);
      return statusNormalized;
    } catch {
      return { connected: false, status: 'disconnected' };
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshNaukriStatus();
    } else {
      setNaukriStatusState({
        connected: false,
        status: 'disconnected',
        userName: '',
        userEmail: '',
        lastValidatedAt: null
      });
    }
  }, [token, refreshNaukriStatus]);

  const openNaukriModal = useCallback((onConnectedSuccess = null) => {
    if (typeof onConnectedSuccess === 'function') {
      setPostConnectCallback(() => onConnectedSuccess);
    } else {
      setPostConnectCallback(null);
    }
    setIsNaukriModalOpen(true);
  }, []);

  const closeNaukriModal = useCallback(() => {
    setIsNaukriModalOpen(false);
    setPostConnectCallback(null);
  }, []);

  const handleStatusChange = useCallback((newData) => {
    if (!newData) return;
    const statusNormalized = {
      connected: Boolean(newData.connected === true || newData.status === 'connected'),
      status: newData.status || (newData.connected ? 'connected' : 'disconnected'),
      userName: newData.userName || newData.userDetails?.name || '',
      userEmail: newData.userEmail || newData.userDetails?.email || '',
      lastValidatedAt: newData.lastValidatedAt || new Date().toISOString()
    };
    setNaukriStatusState(statusNormalized);

    if (statusNormalized.connected && postConnectCallback) {
      postConnectCallback(statusNormalized);
      setPostConnectCallback(null);
    }
  }, [postConnectCallback]);

  return (
    <NaukriContext.Provider
      value={{
        naukriStatus,
        isConnected,
        loading,
        isNaukriModalOpen,
        openNaukriModal,
        closeNaukriModal,
        refreshNaukriStatus,
        setNaukriStatus: handleStatusChange
      }}
    >
      {children}
      <NaukriConnectModal
        isOpen={isNaukriModalOpen}
        onClose={closeNaukriModal}
        onStatusChange={handleStatusChange}
      />
    </NaukriContext.Provider>
  );
};

export const useNaukri = () => {
  const context = useContext(NaukriContext);
  if (!context) {
    throw new Error('useNaukri must be used within a NaukriProvider');
  }
  return context;
};

export default NaukriContext;
