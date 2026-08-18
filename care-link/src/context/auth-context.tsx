import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '@/services/api';
import { saveSession, loadSession, clearSession } from '@/services/token-storage';

interface AuthContextType {
  token: string | null;
  user: any | null;
  isAuthenticated: boolean;
  loading: boolean;
  isRestoring: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { display_name: string; phone: string; birth_date: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    loadSession()
      .then(session => {
        if (session) {
          setToken(session.token);
          setUser(session.user);
        }
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const persistSession = async (data: any) => {
    setToken(data.token);
    setUser(data.user);
    await saveSession(data.token, data.user);
  };

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    try {
      const data = await api.login(username, password);
      await persistSession(data);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (registration: {
    display_name: string;
    phone: string;
    birth_date: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      const data = await api.register(registration);
      await persistSession(data);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setToken(null);
    setUser(null);
    await clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        loading,
        isRestoring,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
