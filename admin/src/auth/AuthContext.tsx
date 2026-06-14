import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokenStore } from '../api/client';

interface Admin {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get<Admin>('/admin/auth/me')
      .then(setAdmin)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; admin: Admin }>('/admin/auth/login', {
      email,
      password,
    });
    tokenStore.set(res.token);
    setAdmin(res.admin);
  };

  const logout = () => {
    tokenStore.clear();
    setAdmin(null);
    location.hash = '#/login';
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
