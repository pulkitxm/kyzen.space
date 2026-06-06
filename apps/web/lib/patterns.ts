import { PATTERN_IDS, PATTERN_STORAGE_KEY } from "@gamelobby/shared/constants";

export {
  DEFAULT_PATTERN,
  getPatternDef,
  PATTERN_IDS,
  PATTERN_STORAGE_KEY,
  PATTERNS,
} from "@gamelobby/shared/constants";
export {
  isValidPattern,
  type PatternDef,
  type PatternId,
} from "@gamelobby/shared/types";

export const PATTERN_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PATTERN_STORAGE_KEY}");var ok=${JSON.stringify(
  PATTERN_IDS,
)};if(v&&ok.indexOf(v)!==-1){document.documentElement.setAttribute("data-pattern",v);}}catch(e){}})();`;
