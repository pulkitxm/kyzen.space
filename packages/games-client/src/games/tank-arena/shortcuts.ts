import type { TankAction } from "@kyzen/shared/types";
import { type Aim, actionFromKey, nudgeAim } from "./model";

const TEXT_OR_LINK =
  'a, input, select, textarea, [contenteditable]:not([contenteditable="false"])';

export type PlanKeyEvent = Pick<
  KeyboardEvent,
  | "key"
  | "target"
  | "shiftKey"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "preventDefault"
>;

export type PlanKeyScope = { board: Element | null; body: Element | null };

export type PlanKeyHandlers = {
  aim: Aim;
  jumpLike: boolean;
  lock: () => void;
  selectAction: (action: TankAction) => void;
  setAim: (aim: Aim) => void;
};

type ShortcutTarget = "free" | "button";

export function shortcutTarget(
  target: EventTarget | null,
  scope: PlanKeyScope,
): ShortcutTarget | null {
  if (!target || typeof (target as Element).closest !== "function") {
    return null;
  }
  const element = target as Element;
  if ((element as HTMLElement).isContentEditable) return null;
  if (element.closest(TEXT_OR_LINK) !== null) return null;
  if (element === scope.body) return "free";
  if (!scope.board?.contains(element)) return null;
  return element.closest("button") === null ? "free" : "button";
}

export function handlePlanKey(
  event: PlanKeyEvent,
  scope: PlanKeyScope,
  handlers: PlanKeyHandlers,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = shortcutTarget(event.target, scope);
  if (!target) return false;
  if (event.key === "Enter") {
    if (target === "button") return false;
    event.preventDefault();
    handlers.lock();
    return true;
  }
  const action = actionFromKey(event.key);
  if (action) {
    handlers.selectAction(action);
    return true;
  }
  const next = nudgeAim(
    handlers.aim,
    event.key,
    event.shiftKey,
    handlers.jumpLike,
  );
  if (!next) return false;
  event.preventDefault();
  handlers.setAim(next);
  return true;
}
