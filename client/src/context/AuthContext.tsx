import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

interface AuthResponse {
  token: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(tokenStore.get());
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {
        tokenStore.clear();
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const accept = useCallback((r: AuthResponse) => {
    tokenStore.set(r.token);
    setToken(r.token);
    setUser(r.user);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      token,
      loading,
      login: async (email, password) => accept(await api.post<AuthResponse>('/auth/login', { email, password })),
      register: async (name, email, password) =>
        accept(await api.post<AuthResponse>('/auth/register', { name, email, password })),
      logout: () => {
        tokenStore.clear();
        setToken(null);
        setUser(null);
      },
    }),
    [user, token, loading, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
