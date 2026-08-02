import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export type FloatingPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

type UseFloatingMenuArgs = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  minWidth?: number;
  maxWidth?: number;
  offset?: number;
  maxPanelHeight?: number;
};

/**
 * Positions a floating panel under (or above) an anchor, clamped to the viewport.
 * Recomputes on scroll/resize so menus don't hide under overflow parents.
 */
export function useFloatingMenu({
  open,
  anchorRef,
  minWidth,
  maxWidth = 360,
  offset = 6,
  maxPanelHeight = 320,
}: UseFloatingMenuArgs) {
  const [placement, setPlacement] = useState<FloatingPlacement | null>(null);

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) {
      setPlacement(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferred = Math.max(rect.width, minWidth ?? rect.width);
    const width = Math.min(preferred, maxWidth, vw - 16);
    const spaceBelow = vh - rect.bottom - offset - 8;
    const spaceAbove = rect.top - offset - 8;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const available = Math.max(140, openUp ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(maxPanelHeight, available);

    let left = rect.left;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
    if (left < 8) left = 8;

    const top = openUp
      ? Math.max(8, rect.top - offset - maxHeight)
      : Math.min(rect.bottom + offset, vh - maxHeight - 8);

    setPlacement({ top, left, width, maxHeight, openUp });
  }, [anchorRef, minWidth, maxWidth, offset, maxPanelHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => update();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, update]);

  return placement;
}

type FloatingPortalProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  menuRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  minWidth?: number;
  maxWidth?: number;
  maxPanelHeight?: number;
  onClose?: () => void;
  role?: string;
  id?: string;
};

/**
 * Renders children in document.body with fixed positioning under the anchor.
 * Avoids clipping by overflow:hidden ancestors (modals, filter bars, cards).
 */
export function FloatingPortal({
  open,
  anchorRef,
  menuRef,
  children,
  className,
  minWidth,
  maxWidth,
  maxPanelHeight,
  onClose,
  role,
  id,
}: FloatingPortalProps) {
  const placement = useFloatingMenu({
    open,
    anchorRef,
    minWidth,
    maxWidth,
    maxPanelHeight,
  });
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !onClose) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const menuEl = menuRef?.current ?? localRef.current;
      if (menuEl?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef, menuRef]);

  if (!open || !placement || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={(node) => {
        localRef.current = node;
        if (menuRef) {
          (menuRef as MutableRefObject<HTMLElement | null>).current = node;
        }
      }}
      id={id}
      role={role}
      className={clsx("floating-portal-menu animate-fade-in", className)}
      style={{
        position: "fixed",
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        zIndex: 10000,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
