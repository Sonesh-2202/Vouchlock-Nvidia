/**
 * Auth context — provides current user state to all components.
 * Checks session on mount; provides login/logout/register actions.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, type AuthUser, ApiRequestError } from './api.js';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string, newPassword: string, confirmPassword?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Check session on mount
  useEffect(() => {
    try {
      localStorage.removeItem('projectpilot_demo_mode');
      localStorage.removeItem('projectpilot_demo_store');
    } catch {
      // Browser storage may be disabled; auth still uses the server session.
    }
    api.auth
      .me()
      .then(({ user }) => setState({ user, loading: false, error: null }))
      .catch(() => setState({ user: null, loading: false, error: null }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { user } = await api.auth.login({ email, password });
      setState({ user, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.error.message : 'Login failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { user } = await api.auth.register({ email, password, displayName });
      setState({ user, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.error.message : 'Registration failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string, newPassword: string, confirmPassword?: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await api.auth.resetPassword({ email, newPassword, confirmPassword });
        if (res.user) {
          setState({ user: res.user, loading: false, error: null });
        } else {
          setState((s) => ({ ...s, loading: false, error: null }));
        }
      } catch (err) {
        const msg = err instanceof ApiRequestError ? err.error.message : 'Password reset failed';
        setState((s) => ({ ...s, loading: false, error: msg }));
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn('Logout API call failed:', err);
    } finally {
      try {
        localStorage.removeItem('projectpilot_demo_mode');
        localStorage.removeItem('projectpilot_demo_store');
        sessionStorage.clear();
      } catch {
        // Browser storage cleanup fallback
      }
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, resetPassword, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
