import { describe, expect, test } from "bun:test";
import type { TankAction } from "@kyzen/shared/types";
import type { Aim } from "../src/games/tank-arena/model";
import {
  handlePlanKey,
  type PlanKeyEvent,
  type PlanKeyScope,
  shortcutTarget,
} from "../src/games/tank-arena/shortcuts";

type FakeNode = {
  tag: string;
  parent: FakeNode | null;
  editable?: boolean;
};

const TEXT_OR_LINK_TAGS = new Set(["a", "input", "select", "textarea"]);

function matches(node: FakeNode, selector: string) {
  if (selector === "button") return node.tag === "button";
  return TEXT_OR_LINK_TAGS.has(node.tag) || Boolean(node.editable);
}

function element(tag: string, parent: FakeNode | null, editable = false) {
  const node: FakeNode = { tag, parent, editable };
  return Object.assign(node, {
    isContentEditable: editable,
    closest: (selector: string) => {
      for (let at: FakeNode | null = node; at; at = at.parent) {
        if (matches(at, selector)) return at;
      }
      return null;
    },
    contains: (other: FakeNode) => {
      for (let at: FakeNode | null = other; at; at = at.parent) {
        if (at === node) return true;
      }
      return false;
    },
  });
}

const html = element("html", null);
const body = element("body", html);
const board = element("div", body);
const canvas = element("div", board);
const actionButton = element("button", board);
const actionLabel = element("span", actionButton);
const boardLink = element("a", board);
const boardInput = element("input", board);
const chat = element("aside", body);
const link = element("a", chat);
const chatInput = element("textarea", chat);
const chatButton = element("button", chat);
const editor = element("div", chat, true);
const panel = element("div", chat);

const scope = {
  board: board as unknown as Element,
  body: body as unknown as Element,
} satisfies PlanKeyScope;

function keyEvent(key: string, target: unknown, shiftKey = false) {
  let prevented = 0;
  const event = {
    key,
    target: target as EventTarget,
    shiftKey,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: () => {
      prevented += 1;
    },
  } satisfies PlanKeyEvent;
  return { event, prevented: () => prevented };
}

function handlers() {
  const calls = { lock: 0, actions: [] as TankAction[], aims: [] as Aim[] };
  return {
    calls,
    value: {
      aim: { angle: 45, power: 0.6 },
      jumpLike: false,
      lock: () => {
        calls.lock += 1;
      },
      selectAction: (action: TankAction) => calls.actions.push(action),
      setAim: (aim: Aim) => calls.aims.push(aim),
    },
  };
}

describe("plan shortcuts", () => {
  test("Enter on a link is left alone", () => {
    const h = handlers();
    const key = keyEvent("Enter", link);
    expect(handlePlanKey(key.event, scope, h.value)).toBe(false);
    expect(key.prevented()).toBe(0);
    expect(h.calls.lock).toBe(0);
  });

  test("Enter and Space on a focused board button keep their native activation", () => {
    for (const target of [actionButton, actionLabel]) {
      for (const name of ["Enter", " "]) {
        const h = handlers();
        const key = keyEvent(name, target);
        expect(handlePlanKey(key.event, scope, h.value)).toBe(false);
        expect(key.prevented()).toBe(0);
        expect(h.calls.lock).toBe(0);
      }
    }
  });

  test("numbers and arrows still work after clicking a board button", () => {
    const h = handlers();
    const digit = keyEvent("2", actionButton);
    expect(handlePlanKey(digit.event, scope, h.value)).toBe(true);
    expect(h.calls.actions).toEqual(["jump"]);
    const arrow = keyEvent("ArrowLeft", actionLabel);
    expect(handlePlanKey(arrow.event, scope, h.value)).toBe(true);
    expect(arrow.prevented()).toBe(1);
    expect(h.calls.aims[0]?.angle).toBe(47);
  });

  test("keys typed into text fields, links, or other page controls never reach the board", () => {
    for (const target of [
      chatInput,
      editor,
      panel,
      chatButton,
      boardLink,
      boardInput,
    ]) {
      for (const name of ["Enter", "2", "ArrowUp"]) {
        const h = handlers();
        const key = keyEvent(name, target);
        expect(handlePlanKey(key.event, scope, h.value)).toBe(false);
        expect(key.prevented()).toBe(0);
        expect(h.calls).toEqual({ lock: 0, actions: [], aims: [] });
      }
    }
  });

  test("the body and the board canvas accept lock, action, and aim keys", () => {
    for (const target of [body, canvas]) {
      const h = handlers();
      const enter = keyEvent("Enter", target);
      expect(handlePlanKey(enter.event, scope, h.value)).toBe(true);
      expect(enter.prevented()).toBe(1);
      expect(h.calls.lock).toBe(1);

      const digit = keyEvent("3", target);
      expect(handlePlanKey(digit.event, scope, h.value)).toBe(true);
      expect(h.calls.actions).toEqual(["shield"]);

      const arrow = keyEvent("ArrowUp", target, true);
      expect(handlePlanKey(arrow.event, scope, h.value)).toBe(true);
      expect(arrow.prevented()).toBe(1);
      expect(h.calls.aims[0]?.power).toBeCloseTo(0.65);
    }
  });

  test("unrelated keys and modified keys pass through untouched", () => {
    const h = handlers();
    const letter = keyEvent("k", body);
    expect(handlePlanKey(letter.event, scope, h.value)).toBe(false);
    const modified = keyEvent("Enter", body);
    const withMeta = { ...modified.event, metaKey: true };
    expect(handlePlanKey(withMeta, scope, h.value)).toBe(false);
    expect(modified.prevented()).toBe(0);
    expect(h.calls.lock).toBe(0);
  });

  test("targets without element APIs are ignored", () => {
    expect(shortcutTarget(null, scope)).toBeNull();
    expect(shortcutTarget({} as EventTarget, scope)).toBeNull();
  });
});
