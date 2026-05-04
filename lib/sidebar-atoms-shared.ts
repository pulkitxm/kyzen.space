/** Shared sidebar storage keys / bounds (used by jotai atoms, cookies, bootstrap script). */
export const SIDEBAR_COLLAPSED_KEY = "gl-sidebar-collapsed";
export const SIDEBAR_WIDTH_KEY = "gl-sidebar-width";

export const DEFAULT_SIDEBAR_WIDTH = 224;
export const MIN_SIDEBAR_WIDTH = 192;
export const MAX_SIDEBAR_WIDTH = 384;

export function clampWidthSafe(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, n));
}

export function clampWidth(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (Number.isNaN(n)) return DEFAULT_SIDEBAR_WIDTH;
  return clampWidthSafe(n);
}
