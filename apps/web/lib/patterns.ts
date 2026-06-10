import {
  DEFAULT_PATTERN,
  getPatternDef,
  PATTERN_IDS,
  PATTERN_STORAGE_KEY,
  PATTERNS,
} from "@gamelobby/shared/constants";
import { isValidPattern, type PatternId } from "@gamelobby/shared/types";

export {
  DEFAULT_PATTERN,
  getPatternDef,
  isValidPattern,
  PATTERN_IDS,
  PATTERNS,
  type PatternId,
};

export function patternVars(
  id: PatternId,
): { url: string; tile: string } | null {
  const def = getPatternDef(id);
  if (!def?.src) return null;
  return { url: `url("${def.src}")`, tile: `${def.tile}px ${def.tile}px` };
}

export function applyPattern(root: HTMLElement, id: PatternId): void {
  root.setAttribute("data-pattern", id);
  const vars = patternVars(id);
  if (vars) {
    root.style.setProperty("--pattern-url", vars.url);
    root.style.setProperty("--pattern-tile", vars.tile);
  } else {
    root.style.removeProperty("--pattern-url");
    root.style.removeProperty("--pattern-tile");
  }
}

const PATTERN_VARS = Object.fromEntries(
  PATTERN_IDS.map((id) => [id, patternVars(id)]),
);

export const PATTERN_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PATTERN_STORAGE_KEY}");var ok=${JSON.stringify(
  PATTERN_IDS,
)};var vars=${JSON.stringify(
  PATTERN_VARS,
)};if(v&&ok.indexOf(v)!==-1){var r=document.documentElement;r.setAttribute("data-pattern",v);var d=vars[v];if(d){r.style.setProperty("--pattern-url",d.url);r.style.setProperty("--pattern-tile",d.tile);}else{r.style.removeProperty("--pattern-url");r.style.removeProperty("--pattern-tile");}}}catch(e){}})();`;
