import { describe, expect, test } from "bun:test";
import {
  JUMP_MAX_ANGLE,
  JUMP_MIN_ANGLE,
  MIN_POWER,
  tankArenaEngine,
} from "@kyzen/games-core";
import type { Seat, TankArenaState } from "@kyzen/shared/types";
import {
  actionFromKey,
  actionSlots,
  aimFromDrag,
  beginAimDrag,
  clampAim,
  cooldownPips,
  DRAG_FULL_POWER,
  defaultAim,
  deriveMode,
  dragPoint,
  localRoleOf,
  lockSummary,
  nudgeAim,
  parseTankState,
  rosterEntries,
  secondsLeft,
  spacedColors,
  statBars,
  TEAM_PALETTE,
  teamColor,
  teamColors,
} from "../src/games/tank-arena/model";

function seats(count: number, teams = false): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    role: `p${i + 1}`,
    team: teams ? (i % 2 === 0 ? "A" : "B") : `p${i + 1}`,
    bot: null,
  }));
}

function start(count = 2, teams = false): TankArenaState {
  return tankArenaEngine.createInitialState(seats(count, teams), {
    config: { mode: teams ? "teams" : "ffa" },
    seed: 77,
  });
}

function apply(state: TankArenaState, role: string, move: unknown) {
  const result = tankArenaEngine.reduce?.(state, { role }, move as never);
  if (!result?.ok) throw new Error(result ? result.error : "no reduce");
  return result.state;
}

function planning(count = 2): TankArenaState {
  let state = start(count);
  for (let i = 0; i < count; i++) {
    state = apply(state, `p${i + 1}`, {
      type: "select",
      round: 0,
      tank: i % 2 === 0 ? "bastion" : "kestrel",
    });
  }
  return state;
}

const players = [
  { userId: "u1", username: "alpha", role: "p1" },
  { userId: "u2", username: "beta", role: "p2" },
];

describe("aimFromDrag", () => {
  const origin = { x: 10, y: 2 };

  test("points at the drag position and scales power with drag length", () => {
    const aim = aimFromDrag(origin, { x: 13, y: 5 }, 64, false);
    expect(aim.angle).toBe(45);
    expect(aim.power).toBeCloseTo(Math.sqrt(18) / DRAG_FULL_POWER, 2);
  });

  test("caps power at full strength and floors it at the minimum", () => {
    expect(aimFromDrag(origin, { x: 40, y: 2 }, 64, false).power).toBe(1);
    expect(aimFromDrag(origin, { x: 10.1, y: 2 }, 64, false).power).toBe(
      MIN_POWER,
    );
  });

  test("aims through the portal seam along the shortest wrapped path", () => {
    const aim = aimFromDrag({ x: 62, y: 0 }, { x: 2, y: 0 }, 64, false);
    expect(aim.angle).toBe(0);
    expect(aim.power).toBeCloseTo(4 / DRAG_FULL_POWER, 2);
  });

  test("keeps jumps pointing upward on the side of the drag", () => {
    expect(aimFromDrag(origin, { x: 15, y: 0 }, 64, true).angle).toBe(
      JUMP_MIN_ANGLE,
    );
    expect(aimFromDrag(origin, { x: 5, y: 0 }, 64, true).angle).toBe(
      JUMP_MAX_ANGLE,
    );
  });

  test("a zero length drag aims straight up", () => {
    expect(aimFromDrag(origin, origin, 64, false).angle).toBe(90);
  });
});

type Camera = {
  x: number;
  y: number;
  distance: number;
  width: number;
  height: number;
  left?: number;
  top?: number;
};

function lens(camera: Camera) {
  const eye = { x: camera.x, y: camera.y + 3.2, z: camera.distance };
  const fz = -camera.distance;
  const fy = -3.2;
  const fl = Math.sqrt(fy * fy + fz * fz);
  const forward = { x: 0, y: fy / fl, z: fz / fl };
  const right = { x: 1, y: 0, z: 0 };
  const up = { x: 0, y: -forward.z, z: forward.y };
  const tanHalf = Math.tan((38 * Math.PI) / 360);
  const aspect = camera.width / camera.height;
  const left = camera.left ?? 0;
  const top = camera.top ?? 0;
  return {
    toScreen(point: { x: number; y: number }) {
      const v = { x: point.x - eye.x, y: point.y - eye.y, z: -eye.z };
      const depth = v.y * forward.y + v.z * forward.z;
      const sx = v.x / (depth * tanHalf * aspect);
      const sy = (v.y * up.y + v.z * up.z) / (depth * tanHalf);
      return {
        x: left + ((sx + 1) / 2) * camera.width,
        y: top + ((1 - sy) / 2) * camera.height,
      };
    },
    toWorld(clientX: number, clientY: number) {
      const sx = ((clientX - left) / camera.width) * 2 - 1;
      const sy = 1 - ((clientY - top) / camera.height) * 2;
      const dx = right.x * sx * tanHalf * aspect;
      const dy = forward.y + up.y * sy * tanHalf;
      const dz = forward.z + up.z * sy * tanHalf;
      const t = -eye.z / dz;
      return { x: eye.x + dx * t, y: eye.y + dy * t };
    },
  };
}

function dragWith(
  press: ReturnType<typeof lens>,
  move: ReturnType<typeof lens>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  origin: { x: number; y: number },
) {
  const drag = beginAimDrag(press.toWorld, from.x, from.y);
  if (!drag) throw new Error("no drag");
  const point = dragPoint(drag, move.toWorld, to.x, to.y, 64);
  if (!point) throw new Error("no point");
  return aimFromDrag(origin, point, 64, true);
}

describe("drag aiming in world space", () => {
  const origin = { x: 20, y: 0.9 };
  const press = { x: 20.3, y: 1.1 };
  const release = { x: 24.1, y: 6.7 };
  const expected = aimFromDrag(origin, release, 64, true);

  test("the same world drag gives the same plan at any zoom or canvas size", () => {
    for (const camera of [
      { x: 22, y: 4, distance: 60, width: 800, height: 450 },
      { x: 22, y: 4, distance: 35, width: 1600, height: 900 },
      { x: 18, y: 2, distance: 90, width: 390, height: 700, left: 40 },
      { x: 25, y: 7, distance: 60, width: 1280, height: 400, top: 120 },
    ]) {
      const view = lens(camera);
      const aim = dragWith(
        view,
        view,
        view.toScreen(press),
        view.toScreen(release),
        origin,
      );
      expect(aim).toEqual(expected);
    }
  });

  test("the camera following or shaking mid-drag does not move the aim", () => {
    const still = lens({ x: 22, y: 4, distance: 60, width: 800, height: 450 });
    const from = still.toScreen(press);
    const to = still.toScreen(release);
    const panned = lens({
      x: 25.5,
      y: 5.2,
      distance: 60,
      width: 800,
      height: 450,
    });
    expect(dragWith(still, panned, from, to, origin)).toEqual(expected);
    expect(
      aimFromDrag(origin, panned.toWorld(to.x, to.y), 64, true),
    ).not.toEqual(expected);
  });

  test("the same on-screen drag from the tank repeats the plan every round", () => {
    const plans = [
      { x: 20, y: 0.9 },
      { x: 9.3, y: 8.9 },
      { x: 51.75, y: 3.1 },
    ].map((tank) => {
      const view = lens({
        x: tank.x + 2,
        y: tank.y + 3,
        distance: 60,
        width: 800,
        height: 450,
      });
      const at = view.toScreen(tank);
      return dragWith(
        view,
        view,
        { x: at.x + 6, y: at.y - 4 },
        { x: at.x + 70, y: at.y - 95 },
        tank,
      );
    });
    expect(plans[1]).toEqual(plans[0]);
    expect(plans[2]).toEqual(plans[0]);
  });
});

describe("keyboard aiming", () => {
  const aim = { angle: 30, power: 0.5 };

  test("left and right arrows rotate the aim", () => {
    expect(nudgeAim(aim, "ArrowLeft", false, false)?.angle).toBe(32);
    expect(nudgeAim(aim, "ArrowRight", false, false)?.angle).toBe(28);
  });

  test("up raises the barrel on either side", () => {
    expect(nudgeAim(aim, "ArrowUp", false, false)?.angle).toBe(32);
    expect(
      nudgeAim({ angle: 150, power: 0.5 }, "ArrowUp", false, false)?.angle,
    ).toBe(148);
  });

  test("shift with arrows changes power within bounds", () => {
    expect(nudgeAim(aim, "ArrowUp", true, false)?.power).toBe(0.55);
    expect(
      nudgeAim({ angle: 0, power: 1 }, "ArrowRight", true, false)?.power,
    ).toBe(1);
    expect(
      nudgeAim({ angle: 0, power: MIN_POWER }, "ArrowDown", true, false)?.power,
    ).toBe(MIN_POWER);
  });

  test("other keys are ignored", () => {
    expect(nudgeAim(aim, "KeyA", false, false)).toBeNull();
    expect(nudgeAim(aim, "Enter", true, false)).toBeNull();
  });

  test("number keys pick actions in bar order", () => {
    expect(actionFromKey("1")).toBe("missile");
    expect(actionFromKey("5")).toBe("specialB");
    expect(actionFromKey("6")).toBeNull();
    expect(actionFromKey("x")).toBeNull();
  });

  test("clampAim wraps angles and rounds for the wire", () => {
    expect(clampAim({ angle: 190, power: 0.333 }, false)).toEqual({
      angle: -170,
      power: 0.33,
    });
    expect(clampAim({ angle: -45, power: 0.5 }, true).angle).toBe(
      JUMP_MIN_ANGLE,
    );
  });
});

describe("HUD derivations", () => {
  test("cooldown pips fill as the special recharges", () => {
    expect(cooldownPips(3, 3)).toEqual({ total: 3, filled: 0, ready: false });
    expect(cooldownPips(3, 1)).toEqual({ total: 3, filled: 2, ready: false });
    expect(cooldownPips(3, 0)).toEqual({ total: 3, filled: 3, ready: true });
    expect(cooldownPips(2, 9)).toEqual({ total: 2, filled: 0, ready: false });
  });

  test("stat bars compare the two tanks on shared scales", () => {
    const bastion = Object.fromEntries(
      statBars("bastion").map((bar) => [bar.key, bar]),
    );
    const kestrel = Object.fromEntries(
      statBars("kestrel").map((bar) => [bar.key, bar]),
    );
    expect(bastion.hp?.fraction).toBe(1);
    expect(kestrel.hp?.fraction).toBe(0.75);
    expect(bastion.accuracy?.fraction).toBe(0.55);
    expect(kestrel.jump?.fraction).toBe(1);
    expect(bastion.mass?.value).toBe("1.80x");
    expect(statBars("kestrel").map((bar) => bar.label)).toEqual([
      "Health",
      "Weight",
      "Accuracy",
      "Jump",
      "Shot speed",
      "Shield",
    ]);
  });

  test("lock summary and roster reflect who has submitted", () => {
    let state = planning(3);
    state = apply(state, "p2", {
      type: "lock",
      round: state.round,
      action: "shield",
      angle: 90,
      power: 0.5,
    });
    expect(lockSummary(state)).toEqual({ locked: 1, total: 3 });
    const roster = rosterEntries(state, players, "p1");
    expect(roster.map((entry) => entry.locked)).toEqual([false, true, false]);
    expect(roster[0]?.local).toBe(true);
    expect(roster[0]?.name).toBe("alpha");
    expect(roster[2]?.name).toBe("P3");
    expect(roster[0]?.maxHp).toBe(160);
    expect(roster[1]?.maxHp).toBe(120);
  });

  test("team members share a color and free for all seats differ", () => {
    const teams = start(4, true);
    expect(teamColor(teams, "p1")).toBe(teamColor(teams, "p3"));
    expect(teamColor(teams, "p1")).not.toBe(teamColor(teams, "p2"));
    const ffa = start(3);
    expect(new Set(["p1", "p2", "p3"].map((r) => teamColor(ffa, r))).size).toBe(
      3,
    );
    expect(teamColor(ffa, "p1")).toBe(TEAM_PALETTE[0]);
  });

  test("any number of players gets distinct colors", () => {
    for (const count of [2, 8, 9, 25, 120]) {
      expect(new Set(spacedColors(count)).size).toBe(count);
    }
    const crowd = start(40);
    const colors = [...teamColors(crowd).values()];
    expect(new Set(colors).size).toBe(40);
    const mine = teamColor(crowd, "p1");
    expect(colors.filter((color) => color === mine).length).toBe(1);
  });

  test("teams keep one color per team in large matches", () => {
    const letters = "ABCDEFGHIJ";
    const big = tankArenaEngine.createInitialState(
      Array.from({ length: 30 }, (_, i) => ({
        role: `p${i + 1}`,
        team: letters[i % letters.length] ?? "A",
        bot: null,
      })),
      { config: { mode: "teams" }, seed: 5 },
    );
    const colors = teamColors(big);
    expect(colors.get("p1")).toBe(colors.get("p11"));
    expect(colors.get("p1")).toBe(colors.get("p21"));
    expect(new Set(colors.values()).size).toBe(10);
  });

  test("action slots disable specials on cooldown and after locking", () => {
    let state = planning(2);
    state = apply(state, "p1", {
      type: "lock",
      round: state.round,
      action: "specialA",
      angle: 45,
      power: 0.5,
    });
    state = apply(state, "p2", {
      type: "lock",
      round: state.round,
      action: "idle",
      angle: 90,
      power: 0.5,
    });
    const slots = actionSlots(state, "p1");
    const special = slots.find((slot) => slot.action === "specialA");
    expect(special?.enabled).toBe(false);
    expect(special?.pips).toEqual({ total: 3, filled: 0, ready: false });
    expect(slots.find((slot) => slot.action === "missile")?.enabled).toBe(true);
    const locked = apply(state, "p1", {
      type: "lock",
      round: state.round,
      action: "missile",
      angle: 45,
      power: 0.5,
    });
    expect(actionSlots(locked, "p1").every((slot) => !slot.enabled)).toBe(true);
    expect(actionSlots(state, null).every((slot) => !slot.enabled)).toBe(true);
  });

  test("countdown seconds round up and never go negative", () => {
    expect(secondsLeft(10_500, 0)).toBe(11);
    expect(secondsLeft(1000, 5000)).toBe(0);
    expect(secondsLeft(null, 0)).toBeNull();
  });
});

describe("board mode", () => {
  test("follows the phase, the local tank, and the replay", () => {
    const select = start(2);
    expect(
      deriveMode({ state: select, localRole: "p1", replaying: false }),
    ).toBe("select");
    expect(
      deriveMode({ state: select, localRole: null, replaying: false }),
    ).toBe("spectate");
    const plan = planning(2);
    expect(deriveMode({ state: plan, localRole: "p1", replaying: false })).toBe(
      "plan",
    );
    expect(deriveMode({ state: plan, localRole: "p1", replaying: true })).toBe(
      "replay",
    );
    const locked = apply(plan, "p1", {
      type: "lock",
      round: plan.round,
      action: "missile",
      angle: 30,
      power: 0.4,
    });
    expect(
      deriveMode({ state: locked, localRole: "p1", replaying: false }),
    ).toBe("locked");
    const out = {
      ...plan,
      tanks: plan.tanks.map((tank) =>
        tank.role === "p1" ? { ...tank, alive: false } : tank,
      ),
    };
    expect(deriveMode({ state: out, localRole: "p1", replaying: false })).toBe(
      "spectate",
    );
    expect(
      deriveMode({
        state: { ...plan, phase: "finished" },
        localRole: "p1",
        replaying: false,
      }),
    ).toBe("finished");
  });

  test("local role comes from the viewer identity", () => {
    expect(localRoleOf(players, "u2")).toBe("p2");
    expect(localRoleOf(players, "nobody")).toBeNull();
    expect(localRoleOf(players, null)).toBeNull();
  });

  test("default aim faces the nearest enemy", () => {
    const state = planning(2);
    const me = state.tanks[0];
    const enemy = state.tanks[1];
    if (!me || !enemy) throw new Error("missing tanks");
    const aim = defaultAim(state, "p1");
    const width = state.modules * 32;
    let dx = enemy.x - me.x;
    if (dx > width / 2) dx -= width;
    if (dx < -width / 2) dx += width;
    expect(aim.angle).toBe(dx >= 0 ? 45 : 135);
  });

  test("parseTankState rejects foreign shapes", () => {
    expect(parseTankState({ board: [] })).toBeNull();
    expect(parseTankState(planning(2))).not.toBeNull();
  });
});
