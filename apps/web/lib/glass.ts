import { GLASS_MODES, GLASS_STORAGE_KEY } from "@kyzen/shared/constants";
import type { GlassMode } from "@kyzen/shared/types";

export {
  DEFAULT_GLASS_MODE,
  GLASS_MODE_DEFS,
  GLASS_MODES,
  GLASS_STORAGE_KEY,
} from "@kyzen/shared/constants";
export {
  type GlassMode,
  isValidGlassMode,
} from "@kyzen/shared/types";

export function applyGlass(root: HTMLElement, id: GlassMode): void {
  if (id === "off") {
    root.removeAttribute("data-glass");
  } else {
    root.setAttribute("data-glass", id);
  }
}

export const GLASS_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${GLASS_STORAGE_KEY}");var ok=${JSON.stringify(
  GLASS_MODES,
)};if(v&&ok.indexOf(v)!==-1){var r=document.documentElement;var cur=r.getAttribute("data-glass")||"off";if(v!==cur){if(v==="off"){r.removeAttribute("data-glass");}else{r.setAttribute("data-glass",v);}}}}catch(e){}})();`;
