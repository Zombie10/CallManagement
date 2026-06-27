import clsx from "clsx";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Show a subtle hint when the table can scroll horizontally */
  scrollHint?: boolean;
};

export function TableScroll({ children, className, scrollHint = false }: Props) {
  return (
    <div className={clsx("table-scroll relative w-full max-w-full", className)}>
      {scrollHint && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-surface-900/90 to-transparent md:hidden"
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}