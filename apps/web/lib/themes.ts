import { PALETTE_STORAGE_KEY, THEME_IDS } from "@kyzen/shared/constants";

export {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  THEME_IDS,
  THEMES,
} from "@kyzen/shared/constants";
export {
  type ColorMode,
  isValidColorMode,
  isValidTheme,
  type ThemeId,
} from "@kyzen/shared/types";

export const PALETTE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PALETTE_STORAGE_KEY}");var ok=${JSON.stringify(
  THEME_IDS,
)};if(v&&ok.indexOf(v)!==-1){document.documentElement.setAttribute("data-theme",v);}}catch(e){}})();`;
