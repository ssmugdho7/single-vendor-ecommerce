"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface AuthContextValue<TUser> {
  user: TUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Escape hatch for flows outside the generic contract (e.g. registration). */
  setSession: (user: TUser, token: string) => void;
}

interface AuthConfig {
  storageKey: string;
  loginUrl: string;
  meUrl: string;
  logoutUrl: string;
}

/**
 * Builds a self-contained auth context (token storage, login/logout,
 * "who am I") for one token "space". Instantiated twice -- customer and
 * admin tokens are stored separately and point at different endpoints,
 * but the shape of "log in, remember a bearer token, fetch /me" is
 * identical, so this is genuine reuse rather than a premature abstraction.
 */
export function createAuthContext<TUser>(config: AuthConfig) {
  const Context = createContext<AuthContextValue<TUser> | null>(null);

  function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<TUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const queryClient = useQueryClient();

    useEffect(() => {
      const token = window.localStorage.getItem(config.storageKey);

      if (!token) {
        setIsLoading(false);
        return;
      }

      apiClient
        .get<TUser>(config.meUrl)
        .then((response) => setUser(response.data))
        .catch(() => window.localStorage.removeItem(config.storageKey))
        .finally(() => setIsLoading(false));
    }, []);

    const login = useCallback(
      async (email: string, password: string) => {
        const response = await apiClient.post(config.loginUrl, { email, password });
        window.localStorage.setItem(config.storageKey, response.data.token);
        setUser(response.data.user);
      },
      [],
    );

    const logout = useCallback(async () => {
      try {
        await apiClient.post(config.logoutUrl);
      } finally {
        window.localStorage.removeItem(config.storageKey);
        setUser(null);
        queryClient.clear();
      }
    }, [queryClient]);

    const setSession = useCallback((nextUser: TUser, token: string) => {
      window.localStorage.setItem(config.storageKey, token);
      setUser(nextUser);
    }, []);

    const value = useMemo(
      () => ({ user, isLoading, login, logout, setSession }),
      [user, isLoading, login, logout, setSession],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useAuth(): AuthContextValue<TUser> {
    const context = useContext(Context);

    if (!context) {
      throw new Error("useAuth must be used within its matching AuthProvider");
    }

    return context;
  }

  return { AuthProvider, useAuth, storageKey: config.storageKey };
}
