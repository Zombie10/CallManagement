import clsx from "clsx";

type AppLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  subtitle?: string;
};

const SIZE: Record<NonNullable<AppLogoProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-14 w-14",
};

/** Call Management mark: open orbit (live channel) + waveform core. Not a bell. */
export function AppLogoMark({ className, size = "md" }: Pick<AppLogoProps, "className" | "size">) {
  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-violet-600 shadow-glow",
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="h-full w-full p-[14%]" fill="none">
        <path
          d="M25.4 10.2A12 12 0 1 0 25.4 29.8"
          stroke="white"
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        <circle cx="25.4" cy="10.2" r="2.35" fill="white" />
        <rect x="13.4" y="16.4" width="2.7" height="7.2" rx="1.35" fill="white" opacity="0.78" />
        <rect x="18.65" y="12.2" width="2.7" height="15.6" rx="1.35" fill="white" />
        <rect x="23.9" y="15" width="2.7" height="10" rx="1.35" fill="white" opacity="0.78" />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}

export function AppLogo({
  className,
  size = "md",
  showWordmark = true,
  subtitle = "Admin Console",
}: AppLogoProps) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <AppLogoMark size={size} />
      {showWordmark && (
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight tracking-tight">
            Call Management
          </p>
          {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
        </div>
      )}
    </div>
  );
}
