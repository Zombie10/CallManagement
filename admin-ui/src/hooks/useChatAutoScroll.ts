import { useEffect, useRef } from "react";

const BOTTOM_THRESHOLD_PX = 96;

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
}

/**
 * Auto-scrolls only while the user is already near the bottom.
 * Stops following new messages when they scroll up to read history.
 */
export function useChatAutoScroll<T>(items: readonly T[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      pinnedRef.current = isNearBottom(el);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [items]);

  return scrollRef;
}