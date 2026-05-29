import { atomWithStorage, createJSONStorage } from "jotai/utils";
import {
  clampWidth,
  clampWidthSafe,
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
} from "@/lib/sidebar-atoms-shared";

export {
  clampWidthSafe,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
} from "@/lib/sidebar-atoms-shared";

const noopStringStorage = {
  getItem: (): string | null => null,
  setItem: () => {},
  removeItem: () => {},
};

function getStringStorage() {
  return typeof window !== "undefined" ? localStorage : noopStringStorage;
}

const sidebarWidthStorage = {
  getItem(key: string, initial: number): number {
    if (typeof window === "undefined") return initial;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initial;
      const parsed: unknown = JSON.parse(item);
      const w = clampWidth(parsed);
      const normalized = JSON.stringify(w);
      if (item !== normalized) window.localStorage.setItem(key, normalized);
      return w;
    } catch {
      return initial;
    }
  },
  setItem(key: string, value: number): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(clampWidthSafe(value)));
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
  subscribe(key: string, callback: (value: number) => void, initial: number) {
    if (typeof window === "undefined") return;
    const listener = (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== localStorage) return;
      try {
        callback(
          e.newValue === null ? initial : clampWidth(JSON.parse(e.newValue)),
        );
      } catch {
        callback(initial);
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  },
};

export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  SIDEBAR_COLLAPSED_KEY,
  false,
  createJSONStorage<boolean>(getStringStorage),
);

export const sidebarWidthAtom = atomWithStorage<number>(
  SIDEBAR_WIDTH_KEY,
  DEFAULT_SIDEBAR_WIDTH,
  sidebarWidthStorage,
);
