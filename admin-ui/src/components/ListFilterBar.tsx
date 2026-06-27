import { Filter, Search, X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  resultCount?: number;
  totalCount?: number;
  onClear?: () => void;
};

export function ListFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  children,
  resultCount,
  totalCount,
  onClear,
}: Props) {
  const hasFilters = search.trim().length > 0;

  return (
    <div className="glass-card space-y-3 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input-field pl-9"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>
        {children}
        {(hasFilters || onClear) && (
          <button
            type="button"
            className="btn-ghost shrink-0 text-xs"
            onClick={() => {
              onSearchChange("");
              onClear?.();
            }}
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>
      {resultCount != null && totalCount != null && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="h-3 w-3" />
          Mostrando {resultCount} de {totalCount}
        </p>
      )}
    </div>
  );
}