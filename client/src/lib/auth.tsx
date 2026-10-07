import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, bootstrapSession, setAccessToken, setUnauthorizedHandler, type SessionPayload } from './api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  isAdmin: boolean;
  login: (identifier: string, password: string, totpCode?: string) => Promise<User>;
  register: (input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
  }) => Promise<{ user: User; emailVerification?: { sent: boolean; previewUrl?: string } }>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<User>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  // On boot: try the httpOnly refresh cookie to obtain a fresh access token.
  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then((data) => {
        if (cancelled) return;
        setAccessToken(data.accessToken);
        setUser(data.user as User);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 anywhere in the app that could not be refreshed means "signed out".
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  const login = useCallback(async (identifier: string, password: string, totpCode?: string) => {
    const data = await api.post<SessionPayload>(
      '/auth/login',
      totpCode ? { identifier, password, totpCode } : { identifier, password },
      { anonymous: true },
    );
    setAccessToken(data.accessToken);
    setUser(data.user as User);
    setStatus('authenticated');
    return data.user as User;
  }, []);

  const register = useCallback(
    async (input: { email: string; username: string; displayName: string; password: string }) => {
      const data = await api.post<{
        accessToken: string;
        user: User;
        emailVerification?: { sent: boolean; previewUrl?: string };
      }>('/auth/register', input, { anonymous: true });
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStatus('authenticated');
      return { user: data.user, emailVerification: data.emailVerification };
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
    const updated = await api.patch<User>('/auth/me', patch);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, status, isAdmin: user?.role === 'ADMIN', login, register, logout, updateProfile }),
    [user, status, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}