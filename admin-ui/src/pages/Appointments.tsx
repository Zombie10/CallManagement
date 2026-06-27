import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ListFilterBar } from "../components/ListFilterBar";
import { useTenant } from "../contexts/TenantContext";
import { api, type AppointmentInput } from "../lib/api";

const emptyForm: AppointmentInput = {
  customer_phone: "",
  scheduled_time: "",
  purpose: "",
  notes: "",
};

type WhenFilter = "all" | "upcoming" | "past";

function parseApptTime(value: string): number {
  const t = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(t) ? 0 : t;
}

export function Appointments() {
  const qc = useQueryClient();
  const { tenantId } = useTenant();
  const [form, setForm] = useState<AppointmentInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [whenFilter, setWhenFilter] = useState<WhenFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", tenantId],
    queryFn: () => api.appointments(200, tenantId),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (editingId) {
        return api.updateAppointment(editingId, form);
      }
      return api.createAppointment(form);
    },
    onSuccess: () => {
      setForm(null);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAppointment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const filtered = useMemo(() => {
    const items = data?.items || [];
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return items.filter((appt) => {
      const ts = parseApptTime(appt.scheduled_time);
      if (whenFilter === "upcoming" && ts < now) return false;
      if (whenFilter === "past" && ts >= now) return false;
      if (!q) return true;
      return (
        appt.customer_phone.toLowerCase().includes(q) ||
        appt.purpose.toLowerCase().includes(q) ||
        (appt.notes || "").toLowerCase().includes(q) ||
        appt.scheduled_time.toLowerCase().includes(q)
      );
    });
  }, [data?.items, search, whenFilter]);

  if (!tenantId || (isLoading && !data)) {
    return <div className="glass-card p-8 text-slate-400">Cargando citas...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Citas & Callbacks</h1>
          <p className="mt-1 text-slate-400">{data?.total ?? 0} citas programadas</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditingId(null);
            setForm({ ...emptyForm });
          }}
        >
          <Plus className="h-4 w-4" />
          Nueva cita
        </button>
      </header>

      <ListFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por teléfono, propósito o notas…"
        resultCount={filtered.length}
        totalCount={data?.items.length ?? 0}
        onClear={() => setWhenFilter("all")}
      >
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span className="shrink-0">Cuándo</span>
          <select
            className="input-field w-full sm:w-40"
            value={whenFilter}
            onChange={(e) => setWhenFilter(e.target.value as WhenFilter)}
          >
            <option value="all">Todas</option>
            <option value="upcoming">Próximas</option>
            <option value="past">Pasadas</option>
          </select>
        </label>
      </ListFilterBar>

      {form && (
        <div className="glass-card grid gap-3 p-5 sm:grid-cols-2">
          <input
            className="input-field"
            placeholder="Teléfono cliente"
            value={form.customer_phone}
            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Fecha/hora (ej. 2026-06-27 15:00)"
            value={form.scheduled_time}
            onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
          />
          <input
            className="input-field sm:col-span-2"
            placeholder="Propósito"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
          <textarea
            className="input-field min-h-[80px] sm:col-span-2"
            placeholder="Notas"
            value={form.notes || ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              className="btn-primary"
              disabled={save.isPending || !form.customer_phone || !form.scheduled_time}
              onClick={() => save.mutate()}
            >
              {editingId ? "Guardar cambios" : "Crear cita"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((appt) => (
          <div key={appt.id} className="glass-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2">
                <Calendar className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-200">{appt.purpose}</p>
                <p className="mt-1 text-sm text-cyan-300">{appt.scheduled_time}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{appt.customer_phone}</p>
                {appt.notes && <p className="mt-2 text-xs text-slate-400">{appt.notes}</p>}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost p-2"
                  onClick={() => {
                    setEditingId(appt.id);
                    setForm({
                      customer_phone: appt.customer_phone,
                      scheduled_time: appt.scheduled_time,
                      purpose: appt.purpose,
                      notes: appt.notes,
                    });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-ghost p-2 text-red-300"
                  onClick={() => remove.mutate(appt.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card col-span-full py-12 text-center text-slate-500">
            Sin citas que coincidan
          </div>
        )}
      </div>
    </div>
  );
}