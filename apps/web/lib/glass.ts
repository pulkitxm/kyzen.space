import { GLASS_MODES, GLASS_STORAGE_KEY } from "@gamelobby/shared/constants";
import type { GlassMode } from "@gamelobby/shared/types";

export {
  DEFAULT_GLASS_MODE,
  GLASS_MODE_DEFS,
  GLASS_MODES,
  GLASS_STORAGE_KEY,
  getGlassModeDef,
} from "@gamelobby/shared/constants";
export {
  type GlassMode,
  isValidGlassMode,
} from "@gamelobby/shared/types";

export function applyGlass(root: HTMLElement, id: GlassMode): void {
  if (id === "off") {
    root.removeAttribute("data-glass");
  } else {
    root.setAttribute("data-glass", id);
  }
}

export const GLASS_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${GLASS_STORAGE_KEY}");var ok=${JSON.stringify(
  GLASS_MODES,
)};if(v&&ok.indexOf(v)!==-1){if(v==="off"){document.documentElement.removeAttribute("data-glass");}else{document.documentElement.setAttribute("data-glass",v);}}}catch(e){}})();`;
