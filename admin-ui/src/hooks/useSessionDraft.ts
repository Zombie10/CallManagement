import { useCallback, useEffect, useRef, useState } from "react";

type DraftPayload = {
  lines?: unknown[];
  input?: string;
  sessionId?: string | null;
  mode?: string;
  savedAt?: string;
};

export function useSessionDraft(storageKey: string) {
  const [dirty, setDirty] = useState(false);
  const restoredRef = useRef(false);

  const loadDraft = useCallback((): DraftPayload | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as DraftPayload) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const saveDraft = useCallback(
    (payload: DraftPayload) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...payload, savedAt: new Date().toISOString() }),
        );
        setDirty(true);
      } catch {
        /* quota exceeded */
      }
    },
    [storageKey],
  );

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setDirty(false);
  }, [storageKey]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return { loadDraft, saveDraft, clearDraft, dirty, setDirty, restoredRef };
}