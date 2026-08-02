import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Select } from "./Select";

type CommonProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  id?: string;
};

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function formatDisplay(value: string): string {
  const p = parseYmd(value);
  if (!p) return "";
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

function startOfMonthGrid(y: number, m: number) {
  // Monday-first grid
  const first = new Date(y, m - 1, 1);
  let weekday = first.getDay(); // 0 Sun
  weekday = weekday === 0 ? 6 : weekday - 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<{ y: number; m: number; d: number; inMonth: boolean }> = [];
  // prev month padding
  const prevDays = new Date(y, m - 1, 0).getDate();
  for (let i = weekday - 1; i >= 0; i--) {
    const d = prevDays - i;
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    cells.push({ y: py, m: pm, d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y, m, d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const i = cells.length - (weekday + daysInMonth);
    const d = i + 1;
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    cells.push({ y: ny, m: nm, d, inMonth: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    let d = last.d + 1;
    let nm = last.m;
    let ny = last.y;
    const dim = new Date(ny, nm, 0).getDate();
    if (d > dim) {
      d = 1;
      nm = nm === 12 ? 1 : nm + 1;
      ny = nm === 1 ? ny + 1 : ny;
    }
    cells.push({ y: ny, m: nm, d, inMonth: false });
  }
  return cells;
}

/** Modern custom calendar (no native OS date UI). Values are YYYY-MM-DD. */
export function DateField({
  value,
  onChange,
  label,
  className,
  disabled,
  min,
  max,
  id,
}: CommonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = parseYmd(value);
  const today = new Date();
  const [viewY, setViewY] = useState(selected?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(selected?.m ?? today.getMonth() + 1);

  useEffect(() => {
    if (selected) {
      setViewY(selected.y);
      setViewM(selected.m);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const cells = useMemo(() => startOfMonthGrid(viewY, viewM), [viewY, viewM]);
  const minP = parseYmd(min || "");
  const maxP = parseYmd(max || "");

  const isDisabledDay = (y: number, m: number, d: number) => {
    const n = y * 10000 + m * 100 + d;
    if (minP) {
      const mn = minP.y * 10000 + minP.m * 100 + minP.d;
      if (n < mn) return true;
    }
    if (maxP) {
      const mx = maxP.y * 10000 + maxP.m * 100 + maxP.d;
      if (n > mx) return true;
    }
    return false;
  };

  const shiftMonth = (delta: number) => {
    let m = viewM + delta;
    let y = viewY;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewM(m);
    setViewY(y);
  };

  return (
    <div ref={rootRef} className={clsx("relative block space-y-1.5", className)}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          "date-field-shell w-full text-left",
          open && "border-cyan-400/45 ring-2 ring-cyan-400/20",
          disabled && "opacity-50",
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <Calendar className="date-field-icon" aria-hidden />
        <span className={clsx("date-field-value", !value && "text-slate-500")}>
          {value ? formatDisplay(value) : "Seleccionar fecha"}
        </span>
      </button>

      {open && (
        <div
          id={listId}
          role="dialog"
          className="date-picker-pop animate-fade-in"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => shiftMonth(-1)}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-slate-100">
              {MONTHS[viewM - 1]} {viewY}
            </p>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => shiftMonth(1)}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[10px] font-medium uppercase text-slate-500">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const ymd = toYmd(c.y, c.m, c.d);
              const isSel = value === ymd;
              const isToday =
                c.y === today.getFullYear() &&
                c.m === today.getMonth() + 1 &&
                c.d === today.getDate();
              const disabledDay = isDisabledDay(c.y, c.m, c.d);
              return (
                <button
                  key={ymd + String(c.inMonth)}
                  type="button"
                  disabled={disabledDay}
                  className={clsx(
                    "date-picker-day",
                    !c.inMonth && "date-picker-day-muted",
                    isSel && "date-picker-day-selected",
                    isToday && !isSel && "date-picker-day-today",
                    disabledDay && "opacity-30",
                  )}
                  onClick={() => {
                    onChange(ymd);
                    setOpen(false);
                  }}
                >
                  {c.d}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Limpiar
            </button>
            <button
              type="button"
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
              onClick={() => {
                const ymd = toYmd(today.getFullYear(), today.getMonth() + 1, today.getDate());
                onChange(ymd);
                setOpen(false);
              }}
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modern time control with custom HH:MM selects (no OS time UI). */
export function TimeField({
  value,
  onChange,
  label,
  className,
  disabled,
  id,
}: Omit<CommonProps, "min" | "max">) {
  const [hh, mm] = (value || "").split(":");
  const hour = /^\d{2}$/.test(hh || "") ? hh! : "";
  const minute = /^\d{2}$/.test(mm || "") ? mm! : "";

  const setPart = (h: string, m: string) => {
    if (!h && !m) {
      onChange("");
      return;
    }
    onChange(`${h || "09"}:${m || "00"}`);
  };

  const hourOptions = useMemo(
    () => [
      { value: "", label: "HH" },
      ...Array.from({ length: 24 }, (_, i) => {
        const h = pad(i);
        return { value: h, label: h };
      }),
    ],
    [],
  );
  const minuteOptions = useMemo(() => {
    const base = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
    const opts = [
      { value: "", label: "MM" },
      ...base.map((m) => ({ value: m, label: m })),
    ];
    if (minute && !base.includes(minute)) {
      opts.push({ value: minute, label: minute });
    }
    return opts;
  }, [minute]);

  return (
    <div className={clsx("block space-y-1.5", className)}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      )}
      <div className={clsx("date-field-shell gap-2 !py-1.5", disabled && "opacity-50")}>
        <Clock className="date-field-icon" aria-hidden />
        <div className="flex w-full items-center gap-1.5 pl-7">
          <Select
            className="min-w-0 flex-1"
            size="sm"
            searchableFrom={0}
            disabled={disabled}
            value={hour}
            onChange={(h) => setPart(h, minute || "00")}
            options={hourOptions}
            placeholder="HH"
          />
          <span className="text-slate-500">:</span>
          <Select
            className="min-w-0 flex-1"
            size="sm"
            searchableFrom={0}
            disabled={disabled}
            value={minute}
            onChange={(m) => setPart(hour || "09", m)}
            options={minuteOptions}
            placeholder="MM"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Split date+time editor for values stored as "YYYY-MM-DD HH:MM" or ISO-ish strings.
 */
export function DateTimeField({
  value,
  onChange,
  label,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { date, time } = splitDateTime(value);

  const emit = (nextDate: string, nextTime: string) => {
    if (!nextDate && !nextTime) {
      onChange("");
      return;
    }
    const d = nextDate || new Date().toISOString().slice(0, 10);
    const t = nextTime || "09:00";
    onChange(`${d} ${t}`);
  };

  return (
    <div className={clsx("space-y-1.5", className)}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DateField value={date} disabled={disabled} onChange={(d) => emit(d, time)} />
        <TimeField value={time} disabled={disabled} onChange={(t) => emit(date, t)} />
      </div>
    </div>
  );
}

function splitDateTime(raw: string): { date: string; time: string } {
  const s = (raw || "").trim();
  if (!s) return { date: "", time: "" };
  const normalized = s.replace("T", " ");
  const [datePart, timePart = ""] = normalized.split(/\s+/);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
  const timeMatch = timePart.match(/^(\d{2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : "";
  return { date, time };
}
