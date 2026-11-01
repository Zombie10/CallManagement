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

/** Call Management mark: headset band, ear cups, and a voice core. */
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
          d="M11 22.4v-3.2a9 9 0 0 1 18 0v3.2"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <rect x="7.2" y="20.2" width="6.2" height="8.8" rx="2.4" fill="white" />
        <rect x="26.6" y="20.2" width="6.2" height="8.8" rx="2.4" fill="white" />
        <path
          d="M30.2 28.2c1.8 2.2 1.2 5-.8 6.2"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="29.2" cy="34.8" r="1.55" fill="white" />
        <rect x="16.2" y="17.4" width="2" height="5.6" rx="1" fill="white" opacity="0.78" />
        <rect x="19" y="14.8" width="2" height="10.8" rx="1" fill="white" />
        <rect x="21.8" y="16.4" width="2" height="7.6" rx="1" fill="white" opacity="0.78" />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}

export function AppLogo({
  className,
  size = "md",
  showWordmark = true,
  subtitle,
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
