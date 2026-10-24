"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseTray, trayStorageKey, type TrayLine } from "@/lib/desk/borrowTray";

const EVENT = "swi:tray-change";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The request tray, kept in sessionStorage for this tab so it survives
 * navigation but not the browser session. Works (in memory only) when
 * storage is blocked.
 */
export function useTray(slug: string, knownItemIds: ReadonlySet<string>) {
  const key = trayStorageKey(slug);
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener(EVENT, notify);
    window.addEventListener("storage", notify);
    return () => {
      window.removeEventListener(EVENT, notify);
      window.removeEventListener("storage", notify);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key) ?? memory.get(key) ?? null, () => null);
  const tray = useMemo(() => parseTray(raw, knownItemIds), [raw, knownItemIds]);
  const setTray = useCallback((next: TrayLine[]) => {
    const value = JSON.stringify(next);
    memory.set(key, value);
    try {
      if (next.length) window.sessionStorage.setItem(key, value);
      else window.sessionStorage.removeItem(key);
    } catch {
      // Storage blocked: the in-memory copy keeps the tray for this page.
    }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [tray, setTray] as const;
}
