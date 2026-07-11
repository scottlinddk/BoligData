import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "boligdata.savedProperties";

function readStored(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Client-only favorites list, kept in localStorage (no server-side saved-properties API yet). */
export function useSavedProperties() {
  const [saved, setSaved] = useState<Set<string>>(readStored);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]));
  }, [saved]);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  const toggle = useCallback((id: string): boolean => {
    let nowSaved = false;
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        nowSaved = false;
      } else {
        next.add(id);
        nowSaved = true;
      }
      return next;
    });
    return nowSaved;
  }, []);

  return { isSaved, toggle };
}
