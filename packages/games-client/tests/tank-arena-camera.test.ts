import { describe, expect, test } from "bun:test";
import {
  actionFocus,
  CAMERA_FOV,
  clampInset,
  damp,
  EDGE_MARGIN,
  frameCamera,
  MAX_INSET,
  MAX_VISIBLE_HEIGHT,
  MIN_VISIBLE_HEIGHT,
  needsMinimap,
  visibleExtent,
  wrappedDelta,
} from "../src/games/tank-arena/camera";
import type { SceneFrame, SceneTank } from "../src/games/tank-arena/view";

function tank(overrides: Partial<SceneTank>): SceneTank {
  return {
    role: "p1",
    name: "p1",
    kind: "bastion",
    color: 0xffffff,
    x: 10,
    y: 0,
    vx: 0,
    vy: 0,
    halfWidth: 1.4,
    height: 2.4,
    hp: 160,
    maxHp: 160,
    alive: true,
    aim: 45,
    shield: 0,
    leaping: false,
    local: false,
    ...overrides,
  };
}

function frame(overrides: Partial<SceneFrame>): SceneFrame {
  return {
    tanks: [],
    projectiles: [],
    walls: [],
    pickups: [],
    mines: [],
    ...overrides,
  };
}

describe("camera framing", () => {
  test("a two module arena fits on a wide screen and stays centered", () => {
    const framing = frameCamera({
      focusX: 5,
      focusY: 1,
      worldWidth: 64,
      waterY: -6,
      aspect: 16 / 9,
    });
    expect(framing.visibleWidth).toBeCloseTo(64 + EDGE_MARGIN * 2, 5);
    expect(framing.x).toBe(32);
    expect(needsMinimap(64, 16 / 9)).toBe(false);
  });

  test("wide arenas follow the focus but stop at the portals", () => {
    const base = { focusY: 1, worldWidth: 320, waterY: -6, aspect: 16 / 9 };
    const middle = frameCamera({ ...base, focusX: 160 });
    expect(middle.x).toBe(160);
    const left = frameCamera({ ...base, focusX: 1 });
    expect(left.x).toBeCloseTo(-EDGE_MARGIN + left.visibleWidth / 2, 5);
    const right = frameCamera({ ...base, focusX: 319 });
    expect(right.x).toBeCloseTo(320 + EDGE_MARGIN - right.visibleWidth / 2, 5);
    expect(needsMinimap(320, 16 / 9)).toBe(true);
  });

  test("portrait screens keep a readable height and need the minimap", () => {
    const extent = visibleExtent(64, 0.5);
    expect(extent.visibleHeight).toBe(MAX_VISIBLE_HEIGHT);
    expect(extent.visibleWidth).toBeCloseTo(MAX_VISIBLE_HEIGHT * 0.5, 5);
    expect(needsMinimap(64, 0.5)).toBe(true);
    const ultrawide = visibleExtent(64, 4);
    expect(ultrawide.visibleHeight).toBe(MIN_VISIBLE_HEIGHT);
  });

  test("the camera distance matches the visible height for the field of view", () => {
    const framing = frameCamera({
      focusX: 32,
      focusY: 0,
      worldWidth: 64,
      waterY: -6,
      aspect: 1.5,
    });
    const half = (CAMERA_FOV * Math.PI) / 360;
    expect(framing.distance * Math.tan(half) * 2).toBeCloseTo(
      framing.visibleHeight,
      5,
    );
  });

  test("the water line sits just above the bottom HUD inset", () => {
    const base = {
      focusX: 32,
      focusY: 1,
      worldWidth: 64,
      waterY: -6,
      aspect: 0.5,
    };
    const bare = frameCamera(base);
    const inset = frameCamera({ ...base, insetBottom: 0.3, insetTop: 0.15 });
    const bottomOfView = inset.y - inset.visibleHeight / 2;
    expect(bottomOfView + inset.visibleHeight * 0.3).toBeCloseTo(-7, 5);
    expect(inset.y).toBeLessThan(bare.y);
  });

  test("a tank high in the air pulls the camera up", () => {
    const base = { focusX: 32, worldWidth: 64, waterY: -6, aspect: 1.6 };
    const low = frameCamera({ ...base, focusY: 1 });
    const high = frameCamera({ ...base, focusY: 40 });
    expect(high.y).toBeGreaterThan(low.y);
  });

  test("insets are clamped to sane fractions", () => {
    expect(clampInset(-1)).toBe(0);
    expect(clampInset(2)).toBe(MAX_INSET);
    expect(clampInset(Number.NaN)).toBe(0);
  });
});

describe("camera motion helpers", () => {
  test("damp converges toward the target without overshooting", () => {
    let value = 0;
    for (let i = 0; i < 120; i++) value = damp(value, 10, 5, 1 / 60);
    expect(value).toBeGreaterThan(9.9);
    expect(value).toBeLessThanOrEqual(10);
    expect(damp(3, 3, 5, 1)).toBe(3);
  });

  test("wrapped deltas take the short way around the seam", () => {
    expect(wrappedDelta(62, 2, 64)).toBe(4);
    expect(wrappedDelta(2, 62, 64)).toBe(-4);
    expect(wrappedDelta(10, 20, 64)).toBe(10);
  });

  test("action focus averages projectiles across the portal seam", () => {
    const focus = actionFocus(
      frame({
        projectiles: [
          { id: "1", kind: "missile", x: 63, y: 4, vx: 1, vy: 0, color: 0 },
          { id: "2", kind: "missile", x: 1, y: 8, vx: 1, vy: 0, color: 0 },
        ],
      }),
      64,
      { x: 30, y: 0 },
    );
    expect(focus.x).toBeCloseTo(0, 5);
    expect(focus.y).toBe(6);
  });

  test("action focus tracks fast tanks and falls back when calm", () => {
    const moving = actionFocus(
      frame({ tanks: [tank({ x: 40, vx: 6 }), tank({ role: "p2", x: 5 })] }),
      64,
      { x: 1, y: 1 },
    );
    expect(moving.x).toBe(40);
    const calm = actionFocus(frame({ tanks: [tank({})] }), 64, { x: 7, y: 3 });
    expect(calm).toEqual({ x: 7, y: 3 });
  });
});
