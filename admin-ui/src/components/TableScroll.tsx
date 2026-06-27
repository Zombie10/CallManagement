import clsx from "clsx";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Minimum table width before horizontal scroll kicks in */
  minWidth?: number;
};

export function TableScroll({ children, className, minWidth = 720 }: Props) {
  return (
    <div className={clsx("table-scroll", className)}>
      <div className="inline-block min-w-full align-middle" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}