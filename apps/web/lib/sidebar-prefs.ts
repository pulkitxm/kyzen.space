import {
  clampWidthSafe,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
} from "@/lib/sidebar-atoms-shared";

export const SIDEBAR_PREFS_COOKIE = "gl_sidebar";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export type SidebarPrefs = {
  collapsed: boolean;
  width: number;
};

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = {
  collapsed: false,
  width: DEFAULT_SIDEBAR_WIDTH,
};

function parsePrefsFromEncoded(raw: string | undefined): SidebarPrefs | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw.trim()));
    if (typeof parsed !== "object" || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    const c = o.collapsed ?? o.c;
    const w = o.width ?? o.w;
    const collapsed =
      c === true || c === 1 || c === "1" || String(c) === "true";
    let widthNum: number =
      typeof w === "number" ? w : Number.parseInt(String(w), 10);
    if (!Number.isFinite(widthNum)) widthNum = DEFAULT_SIDEBAR_WIDTH;
    return {
      collapsed,
      width: clampWidthSafe(widthNum),
    };
  } catch {
    return null;
  }
}

export function parseSidebarPrefsCookieValue(
  value: string | undefined,
): SidebarPrefs {
  return parsePrefsFromEncoded(value) ?? DEFAULT_SIDEBAR_PREFS;
}

export function encodeSidebarPrefsCookieValue(prefs: SidebarPrefs): string {
  return encodeURIComponent(
    JSON.stringify({
      collapsed: prefs.collapsed,
      width: clampWidthSafe(prefs.width),
    }),
  );
}

export function persistSidebarPrefsToCookie(prefs: SidebarPrefs): void {
  try {
    const v = encodeSidebarPrefsCookieValue(prefs);
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is not universally supported; SSR reads this cookie for sidebar hydration
    document.cookie = `${SIDEBAR_PREFS_COOKIE}=${v}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {}
}

export const SIDEBAR_LS_BOOT_SCRIPT = `(function(){try{
var KC=${JSON.stringify(SIDEBAR_COLLAPSED_KEY)};
var KW=${JSON.stringify(SIDEBAR_WIDTH_KEY)};
var DEF=${DEFAULT_SIDEBAR_WIDTH},MIN=${MIN_SIDEBAR_WIDTH},MAX=${MAX_SIDEBAR_WIDTH};
function rd(k){try{return localStorage.getItem(k)}catch(e){return null}}
function cw(n){return typeof n!=='number'||isNaN(n)?DEF:Math.min(MAX,Math.max(MIN,n))}
var col=false;
try{col=(JSON.parse(rd(KC)||'false')===true)}catch(_){}
var w=DEF;
try{w=cw(Number(JSON.parse(rd(KW)||String(DEF))))}catch(_){try{w=cw(Number.parseInt(String(rd(KW)||''),10))}catch(__){}}
var v=encodeURIComponent(JSON.stringify({collapsed:col,width:w}));
document.cookie=${JSON.stringify(SIDEBAR_PREFS_COOKIE)}+"="+v+"; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax";
}catch(e){}})();`;
