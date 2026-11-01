import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { api, type AuthUserResponse } from "../lib/api";
import { initialAdminLocale, translate } from "../lib/i18n";

type AuthContextValue = {
  user: AuthUserResponse | null;
  loading: boolean;
  refresh: () => Promise<AuthUserResponse>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch, isError } = useQuery({
    queryKey: ["auth-me"],
    queryFn: api.authMe,
    retry: false,
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    const result = await refetch();
    if (result.isError || !result.data) {
      let locale = initialAdminLocale(null);
      try {
        locale = initialAdminLocale(localStorage.getItem("callmgmt.adminLocale"));
      } catch {
        /* keep the default locale */
      }
      throw new Error(translate("login.sessionInvalid", locale));
    }
    return result.data;
  }, [refetch]);

  const logout = useCallback(async () => {
    await api.logout();
    queryClient.setQueryData(["auth-me"], null);
    await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: isError ? null : user ?? null,
      loading: isLoading,
      refresh,
      logout,
    }),
    [user, isLoading, isError, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}