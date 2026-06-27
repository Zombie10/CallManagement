import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type TenantRecord } from "../lib/api";
import { useAuth } from "./AuthContext";

type TenantContextValue = {
  tenant: TenantRecord | null;
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
  isSuperAdmin: boolean;
  loading: boolean;
};

const Ctx = createContext<TenantContextValue | null>(null);
const TENANT_STORAGE_KEY = "callmgmt-selected-tenant";

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [tenantId, setTenantIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TENANT_STORAGE_KEY);
  });

  const setTenantId = useCallback((id: string | null) => {
    api.setTenantHeaders(id);
    setTenantIdState(id);
    if (id) localStorage.setItem(TENANT_STORAGE_KEY, id);
    else localStorage.removeItem(TENANT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (user?.tenant_id) setTenantId(user.tenant_id);
  }, [user?.tenant_id]);

  useEffect(() => {
    api.setTenantHeaders(tenantId);
  }, [tenantId]);

  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: ["tenant-mine", tenantId],
    queryFn: api.tenantMine,
    enabled: !!tenantId && !isSuperAdmin,
  });

  const { data: tenantsList, isLoading: listLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (isSuperAdmin && !tenantId && tenantsList?.tenants.length) {
      const def = tenantsList.tenants.find((t) => t.slug === "default") || tenantsList.tenants[0];
      setTenantId(def.id);
    }
  }, [isSuperAdmin, tenantId, tenantsList]);

  const tenant = useMemo(() => {
    if (!tenantId) return null;
    if (mine && mine.id === tenantId) return mine;
    return tenantsList?.tenants.find((t) => t.id === tenantId) ?? null;
  }, [tenantId, mine, tenantsList]);

  const value = useMemo(
    () => ({
      tenant,
      tenantId,
      setTenantId,
      isSuperAdmin,
      loading: mineLoading || (isSuperAdmin && listLoading),
    }),
    [tenant, tenantId, isSuperAdmin, mineLoading, listLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}