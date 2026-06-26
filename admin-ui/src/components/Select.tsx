import { ChevronDown, Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

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
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  disabled = false,
  className,
  size = "md",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          "select-trigger w-full text-left",
          size === "sm" && "select-trigger-sm",
          disabled && "opacity-50",
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={clsx("truncate", !selected && "text-slate-500")}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180 text-cyan-400",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="select-menu animate-fade-in"
        >
          {options.map((opt) => {
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
        </ul>
      )}
    </div>
  );
}