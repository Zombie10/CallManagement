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

/** Modern Call Management mark: soft bell + signal arcs on cyan→indigo gradient. */
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
      <svg viewBox="0 0 40 40" className="h-full w-full p-[18%]" fill="none">
        <path
          d="M20 6.5c-5.2 0-9.4 3.9-9.4 8.8v5.2c0 1.2-.4 2.4-1.2 3.3l-1.1 1.2c-.7.7-.2 1.9.8 1.9h21.8c1 0 1.5-1.2.8-1.9l-1.1-1.2c-.8-.9-1.2-2.1-1.2-3.3v-5.2c0-4.9-4.2-8.8-9.4-8.8z"
          fill="white"
          fillOpacity="0.95"
        />
        <path
          d="M15.2 29.2c1.2 1.7 2.9 2.8 4.8 2.8s3.6-1.1 4.8-2.8"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="20" cy="13.2" r="1.5" fill="#0e7490" />
        {/* subtle signal rings */}
        <path
          d="M10 12.5c-1.8 2-2.8 4.4-2.8 7"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M30 12.5c1.8 2 2.8 4.4 2.8 7"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.35"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
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
