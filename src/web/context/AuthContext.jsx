import React, { createContext, useState, useEffect } from 'react';
import { loginApi, registerApi, getProfileApi } from '../services/authService';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      getProfileApi()
        .then((res) => {
          if (res.data) {
            setUser(res.data);
            localStorage.setItem('user', JSON.stringify(res.data));
          }
        })
        .catch(() => {
          // If token is invalid or expired, clear authentication
          setToken('');
          setUser(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        });
    }
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await loginApi(email, password);
      const authToken = res.data?.token || res.token;
      const userInfo = res.data?.user || res.user;
      if (!authToken) {
        throw new Error(res.message || 'Login failed - missing token');
      }
      setToken(authToken);
      setUser(userInfo);
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(userInfo));
      return userInfo;
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password) => {
    setLoading(true);
    try {
      const res = await registerApi(username, email, password);
      const authToken = res.data?.token || res.token;
      const userInfo = res.data?.user || res.user;
      if (!authToken) {
        throw new Error(res.message || 'Registration failed - missing token');
      }
      setToken(authToken);
      setUser(userInfo);
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(userInfo));
      return userInfo;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
