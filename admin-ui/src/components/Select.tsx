import { ChevronDown, Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FloatingPortal } from "./FloatingPortal";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  /** Show search box when options exceed this count (default 8). Set 0 to disable. */
  searchableFrom?: number;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  disabled = false,
  className,
  size = "md",
  searchableFrom = 8,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const showSearch = searchableFrom > 0 && options.length >= searchableFrom;

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q),
    );
  }, [options, query, showSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (showSearch) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, showSearch]);

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          "select-trigger w-full text-left",
          size === "sm" && "select-trigger-sm",
          open && "select-trigger-open",
          disabled && "opacity-50",
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={clsx("min-w-0 truncate", !selected && "text-slate-500")}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180 text-cyan-400",
          )}
        />
      </button>

      <FloatingPortal
        open={open}
        anchorRef={triggerRef}
        menuRef={menuRef}
        id={listId}
        role="listbox"
        className="select-menu-portal"
        maxWidth={420}
        maxPanelHeight={320}
        onClose={() => setOpen(false)}
      >
        {showSearch && (
          <div className="sticky top-0 z-10 mb-1 border-b border-white/5 bg-surface-950/95 p-1.5 backdrop-blur">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchRef}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-8 pr-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                placeholder="Buscar…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>
        )}
        <ul className="max-h-[inherit] space-y-0.5 overflow-y-auto">
          {filtered.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={clsx("select-option", active && "select-option-active")}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{opt.label}</span>
                    {opt.description && (
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {opt.description}
                      </span>
                    )}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-cyan-400" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-slate-500">Sin resultados</li>
          )}
        </ul>
      </FloatingPortal>
    </div>
  );
}
