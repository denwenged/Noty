import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, type User } from './api';
import { haptic } from './lib/haptics';

type Toast = { id: number; msg: string; kind?: 'ok' | 'err' };

type Ctx = {
  user: User | null;
  loading: boolean;
  config: { allowSignup: boolean; siteName: string; hasUsers: boolean };
  refreshConfig: () => void;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, e: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  toasts: Toast[];
};

const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [config, setConfig] = useState({ allowSignup: true, siteName: 'Noty', hasUsers: true });

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    if (kind === 'err') haptic.warn();
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const refreshConfig = useCallback(() => {
    api.get<typeof config>('/auth/config').then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    refreshConfig();
    api
      .get<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshConfig]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = user?.theme || localStorage.getItem('noty_theme') || 'light';
    root.dataset.accent = user?.accent || localStorage.getItem('noty_accent') || 'violet';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', root.dataset.theme === 'light' ? '#fbf9f6' : '#0f0e15');
  }, [user?.theme, user?.accent]);

  const login = async (username: string, password: string) => {
    const r = await api.post<{ user: User }>('/auth/login', { username, password });
    setUser(r.user);
  };
  const register = async (username: string, email: string, password: string) => {
    const r = await api.post<{ user: User }>('/auth/register', { username, email, password });
    setUser(r.user);
    refreshConfig();
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };
  const updateUser = async (patch: Partial<User>) => {
    const r = await api.patch<{ user: User }>('/auth/me', patch);
    setUser(r.user);
    if (patch.theme) localStorage.setItem('noty_theme', patch.theme);
    if (patch.accent) localStorage.setItem('noty_accent', patch.accent);
  };

  return (
    <C.Provider
      value={{ user, loading, config, refreshConfig, login, register, logout, updateUser, toast, toasts }}
    >
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind === 'ok' ? 'ok' : '')}>
            {t.msg}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
