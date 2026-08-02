import { Calendar, Clock } from "lucide-react";
import clsx from "clsx";

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

/** Modern dark-theme date control (YYYY-MM-DD). */
export function DateField({
  value,
  onChange,
  label,
  className,
  disabled,
  required,
  min,
  max,
  id,
}: CommonProps) {
  return (
    <label className={clsx("block space-y-1.5", className)}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      )}
      <div className={clsx("date-field-shell", disabled && "opacity-50")}>
        <Calendar className="date-field-icon" aria-hidden />
        <input
          id={id}
          type="date"
          className="date-field-input"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

/** Modern dark-theme time control (HH:MM). */
export function TimeField({
  value,
  onChange,
  label,
  className,
  disabled,
  required,
  id,
}: Omit<CommonProps, "min" | "max">) {
  return (
    <label className={clsx("block space-y-1.5", className)}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      )}
      <div className={clsx("date-field-shell", disabled && "opacity-50")}>
        <Clock className="date-field-icon" aria-hidden />
        <input
          id={id}
          type="time"
          className="date-field-input"
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
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
        <DateField
          value={date}
          disabled={disabled}
          onChange={(d) => emit(d, time)}
          label={undefined}
        />
        <TimeField
          value={time}
          disabled={disabled}
          onChange={(t) => emit(date, t)}
          label={undefined}
        />
      </div>
    </div>
  );
}

function splitDateTime(raw: string): { date: string; time: string } {
  const s = (raw || "").trim();
  if (!s) return { date: "", time: "" };
  // "2026-06-27 15:00" | "2026-06-27T15:00" | "2026-06-27T15:00:00"
  const normalized = s.replace("T", " ");
  const [datePart, timePart = ""] = normalized.split(/\s+/);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
  const timeMatch = timePart.match(/^(\d{2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : "";
  return { date, time };
}
