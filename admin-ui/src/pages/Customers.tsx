import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Users } from "lucide-react";
import { api } from "../lib/api";

export function Customers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => api.customers() });

  const toggleVip = useMutation({
    mutationFn: ({ phone, vip }: { phone: string; vip: boolean }) =>
      api.updateCustomer(phone, { vip }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando clientes...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Clientes CRM</h1>
        <p className="mt-1 text-slate-400">{data.total} clientes registrados</p>
      </header>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left text-sm">
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
            {data.items.map((c) => (
              <tr key={c.phone_number} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-cyan-200">{c.phone_number}</td>
                <td className="px-4 py-3">{c.name || "—"}</td>
                <td className="px-4 py-3 text-slate-400">{c.email || "—"}</td>
                <td className="px-4 py-3">
                  <button
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
        {data.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
            <Users className="h-8 w-8" />
            <p>Sin clientes aún</p>
          </div>
        )}
      </div>
    </div>
  );
}