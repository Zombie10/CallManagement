import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  accent?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, accent = "from-cyan-500/20 to-blue-600/10" }: Props) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`rounded-xl bg-gradient-to-br p-3 ${accent}`}>
          <Icon className="h-5 w-5 text-cyan-300" />
        </div>
      </div>
    </div>
  );
}