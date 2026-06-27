import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListFilterBar } from "../components/ListFilterBar";
import { TableScroll } from "../components/TableScroll";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

type VipFilter = "all" | "vip" | "normal";

export function Customers() {
  const qc = useQueryClient();
  const { tenantId } = useTenant();
  const [search, setSearch] = useState("");
  const [vipFilter, setVipFilter] = useState<VipFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: () => api.customers(500, tenantId),
    enabled: !!tenantId,
  });

  const toggleVip = useMutation({
    mutationFn: ({ phone, vip }: { phone: string; vip: boolean }) =>
      api.updateCustomer(phone, { vip }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  const filtered = useMemo(() => {
    const items = data?.items || [];
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (vipFilter === "vip" && !c.vip) return false;
      if (vipFilter === "normal" && c.vip) return false;
      if (!q) return true;
      return (
        c.phone_number.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      );
    });
  }, [data?.items, search, vipFilter]);

  const clearFilters = () => setVipFilter("all");

  if (!tenantId || (isLoading && !data)) {
    return <div className="glass-card p-8 text-slate-400">Cargando clientes...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-semibold sm:text-3xl">Clientes CRM</h1>
        <p className="mt-1 text-sm text-slate-400 sm:text-base">{data?.total ?? 0} clientes registrados</p>
      </header>

      <ListFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por teléfono, nombre o email…"
        resultCount={filtered.length}
        totalCount={data?.items.length ?? 0}
        onClear={clearFilters}
      >
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span className="shrink-0">VIP</span>
          <select
            className="input-field w-full sm:w-36"
            value={vipFilter}
            onChange={(e) => setVipFilter(e.target.value as VipFilter)}
          >
            <option value="all">Todos</option>
            <option value="vip">Solo VIP</option>
            <option value="normal">Sin VIP</option>
          </select>
        </label>
      </ListFilterBar>

      <div className="space-y-3 md:hidden">
        {filtered.map((c) => (
          <article key={c.phone_number} className="glass-card space-y-3 p-4">
            <div>
              <p className="font-mono text-sm text-cyan-200">{c.phone_number}</p>
              <Link
                to={`/customers/${encodeURIComponent(c.phone_number)}`}
                className="mt-1 block font-medium text-slate-100 hover:text-cyan-200"
              >
                {c.name || "Sin nombre"}
              </Link>
              <p className="text-sm text-slate-400">{c.email || "Sin email"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs ${c.vip ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-slate-500"}`}
                onClick={() => toggleVip.mutate({ phone: c.phone_number, vip: !c.vip })}
              >
                <Crown className="inline h-3 w-3" /> {c.vip ? "VIP" : "Normal"}
              </button>
              <p className="text-xs text-slate-500">{c.updated_at?.slice(0, 19) || "—"}</p>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-2 py-12 text-slate-500">
            <Users className="h-8 w-8" />
            <p>Sin clientes que coincidan</p>
          </div>
        )}
      </div>

      <div className="glass-card hidden w-full md:block">
        <TableScroll>
          <table className="data-table">
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">VIP</th>
                <th className="px-4 py-3">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone_number} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-cyan-200">{c.phone_number}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/customers/${encodeURIComponent(c.phone_number)}`}
                      className="hover:text-cyan-200"
                    >
                      {c.name || "Ver ficha"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className={`rounded-lg px-2 py-1 text-xs ${c.vip ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-slate-500"}`}
                      onClick={() => toggleVip.mutate({ phone: c.phone_number, vip: !c.vip })}
                    >
                      <Crown className="inline h-3 w-3" /> {c.vip ? "VIP" : "Normal"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.updated_at?.slice(0, 19) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
            <Users className="h-8 w-8" />
            <p>Sin clientes que coincidan</p>
          </div>
        )}
      </div>
    </div>
  );
}