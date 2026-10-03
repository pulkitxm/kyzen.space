import { describe, expect, test } from "bun:test";
import { type SimEvent, TANKS, tankArenaEngine } from "@kyzen/games-core";
import type { Seat, TankArenaState } from "@kyzen/shared/types";
import {
  buildReplay,
  eventSounds,
  interpolateFrame,
  projectileSplashes,
  replayCursor,
  replayDurationMs,
  replayOffset,
  replayPlayer,
  type SoundName,
  sceneContext,
  sceneEvents,
  stateScene,
} from "../src/games/tank-arena/replay";
import type {
  SceneEvent,
  SceneFrame,
  SceneTank,
} from "../src/games/tank-arena/view";

const players = [
  { userId: "u1", username: "alpha", role: "p1" },
  { userId: "u2", username: "beta", role: "p2" },
];

function apply(state: TankArenaState, role: string, move: unknown) {
  const result = tankArenaEngine.reduce?.(state, { role }, move as never);
  if (!result?.ok) throw new Error(result ? result.error : "no reduce");
  return result.state;
}

function resolved(): TankArenaState {
  const seats: Seat[] = [
    { role: "p1", team: "p1", bot: null },
    { role: "p2", team: "p2", bot: null },
  ];
  let state = tankArenaEngine.createInitialState(seats, {
    config: { mode: "ffa" },
    seed: 2024,
  });
  state = apply(state, "p1", { type: "select", round: 0, tank: "bastion" });
  state = apply(state, "p2", { type: "select", round: 0, tank: "kestrel" });
  const [a, b] = state.tanks;
  if (!a || !b) throw new Error("missing tanks");
  const toward = (from: number, to: number) => (to >= from ? 40 : 140);
  state = apply(state, "p1", {
    type: "lock",
    round: 1,
    action: "missile",
    angle: toward(a.x, b.x),
    power: 0.7,
  });
  return apply(state, "p2", {
    type: "lock",
    round: 1,
    action: "jump",
    angle: 80,
    power: 0.6,
  });
}

function tank(overrides: Partial<SceneTank>): SceneTank {
  return {
    role: "p1",
    name: "p1",
    kind: "kestrel",
    color: 0xffffff,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    halfWidth: 1.05,
    height: 1.8,
    hp: 120,
    maxHp: 120,
    alive: true,
    aim: 0,
    shield: 0,
    leaping: false,
    local: false,
    ...overrides,
  };
}

function frame(tanks: SceneTank[], overrides: Partial<SceneFrame> = {}) {
  return {
    tanks,
    projectiles: [],
    walls: [],
    pickups: [],
    mines: [],
    ...overrides,
  } satisfies SceneFrame;
}

describe("buildReplay", () => {
  const state = resolved();
  const ctx = sceneContext(state, players, "p1");
  const replay = buildReplay(state, ctx, new Map());

  test("re-simulates every step of the stored resolution", () => {
    expect(state.resolution?.round).toBe(1);
    expect(replay).not.toBeNull();
    if (!replay || !state.resolution) return;
    expect(replay.round).toBe(1);
    expect(replay.frames.length).toBe(state.resolution.steps + 1);
    expect(replay.events.length).toBe(replay.frames.length);
    expect(replay.durationMs).toBe(replayDurationMs(state.resolution.steps));
  });

  test("starts from the pre-resolution snapshot and ends on the authoritative state", () => {
    if (!replay || !state.resolution) throw new Error("no replay");
    const first = replay.frames[0];
    const last = replay.frames[replay.frames.length - 1];
    const before = state.resolution.before.tanks[0];
    const after = state.tanks[0];
    if (!first || !last || !before || !after) throw new Error("missing");
    expect(first.tanks[0]?.x).toBe(before.x);
    expect(last.tanks[0]?.x).toBeCloseTo(after.x, 2);
    expect(last.tanks[0]?.y).toBeCloseTo(after.y - TANKS.bastion.halfHeight, 2);
  });

  test("turns simulation events into scene effects and sounds", () => {
    if (!replay) throw new Error("no replay");
    const all = replay.events.flat();
    expect(all.some((e) => e.type === "fire" && e.role === "p1")).toBe(true);
    expect(all.some((e) => e.type === "jump" && e.role === "p2")).toBe(true);
    expect(all.some((e) => e.type === "explode" || e.type === "splash")).toBe(
      true,
    );
    expect(replay.sounds.flat()).toContain("fire");
    expect(replay.sounds.flat()).toContain("jump");
  });

  test("tanks carry team colors, names, and the revealed plan angle", () => {
    if (!replay) throw new Error("no replay");
    const mid = replay.frames[Math.floor(replay.frames.length / 2)];
    const p1 = mid?.tanks.find((t) => t.role === "p1");
    expect(p1?.name).toBe("alpha");
    expect(p1?.local).toBe(true);
    expect(p1?.kind).toBe("bastion");
    expect(p1?.aim).toBe(state.resolution?.plans.p1?.angle ?? Number.NaN);
  });

  test("returns null without a resolution", () => {
    const fresh = tankArenaEngine.createInitialState(
      [
        { role: "p1", team: "p1", bot: null },
        { role: "p2", team: "p2", bot: null },
      ],
      { config: {}, seed: 1 },
    );
    expect(
      buildReplay(fresh, sceneContext(fresh, players, "p1"), new Map()),
    ).toBeNull();
  });
});

describe("stateScene", () => {
  test("hides tanks whose kind is still secret and reveals the local pick", () => {
    const fresh = tankArenaEngine.createInitialState(
      [
        { role: "p1", team: "p1", bot: null },
        { role: "p2", team: "p2", bot: null },
      ],
      { config: {}, seed: 1 },
    );
    const ctx = sceneContext(fresh, players, "p1", "kestrel");
    const scene = stateScene(fresh, ctx, new Map([["p1", 33]]));
    expect(scene.tanks[0]?.kind).toBe("kestrel");
    expect(scene.tanks[0]?.alive).toBe(true);
    expect(scene.tanks[0]?.aim).toBe(33);
    expect(scene.tanks[1]?.kind).toBeNull();
    expect(scene.tanks[1]?.alive).toBe(false);
  });
});

describe("frame interpolation", () => {
  test("blends positions between simulation steps", () => {
    const a = frame([tank({ x: 10, y: 2, vx: 1 })], {
      projectiles: [
        { id: "7", kind: "missile", x: 0, y: 0, vx: 0, vy: 0, color: 0 },
      ],
    });
    const b = frame([tank({ x: 12, y: 4, vx: 3, hp: 90 })], {
      projectiles: [
        { id: "7", kind: "missile", x: 4, y: 2, vx: 0, vy: 0, color: 0 },
      ],
    });
    const mid = interpolateFrame(a, b, 0.5, 64);
    expect(mid.tanks[0]?.x).toBe(11);
    expect(mid.tanks[0]?.y).toBe(3);
    expect(mid.tanks[0]?.vx).toBe(2);
    expect(mid.tanks[0]?.hp).toBe(90);
    expect(mid.projectiles[0]?.x).toBe(2);
    expect(interpolateFrame(a, b, 0, 64)).toBe(a);
    expect(interpolateFrame(a, b, 1, 64)).toBe(b);
  });

  test("snaps instead of sweeping across the map when wrapping", () => {
    const a = frame([tank({ x: 63.8 })]);
    const b = frame([tank({ x: 0.2 })]);
    expect(interpolateFrame(a, b, 0.25, 64).tanks[0]?.x).toBe(63.8);
    expect(interpolateFrame(a, b, 0.75, 64).tanks[0]?.x).toBe(0.2);
  });

  test("new projectiles and dead tanks are not interpolated", () => {
    const a = frame([tank({ x: 1, alive: false })]);
    const b = frame([tank({ x: 5, alive: false })], {
      projectiles: [
        { id: "9", kind: "bomb", x: 3, y: 30, vx: 0, vy: -8, color: 0 },
      ],
    });
    const mid = interpolateFrame(a, b, 0.5, 64);
    expect(mid.tanks[0]?.x).toBe(5);
    expect(mid.projectiles[0]?.y).toBe(30);
  });
});

describe("replay timing", () => {
  test("cursor advances at sixty steps per second and reports completion", () => {
    expect(replayCursor(0, 61)).toEqual({ index: 0, t: 0, done: false });
    const quarter = replayCursor(250, 61);
    expect(quarter.index).toBe(15);
    expect(quarter.done).toBe(false);
    const half = replayCursor(1000 / 120, 61);
    expect(half.index).toBe(0);
    expect(half.t).toBeCloseTo(0.5, 5);
    expect(replayCursor(1000, 61)).toEqual({ index: 60, t: 0, done: true });
    expect(replayCursor(5000, 61).done).toBe(true);
    expect(replayCursor(-10, 61).index).toBe(0);
  });

  test("late joiners resume mid replay and skip finished ones", () => {
    const base = { deadline: 50_000, roundTimeMs: 30_000, durationMs: 4000 };
    expect(replayOffset({ ...base, now: 21_000 })).toBe(1000);
    expect(replayOffset({ ...base, now: 19_000 })).toBe(0);
    expect(replayOffset({ ...base, now: 24_500 })).toBeNull();
    expect(replayOffset({ ...base, deadline: null, now: 0 })).toBeNull();
  });
});

describe("replay player", () => {
  function oneSecond() {
    const frames = Array.from({ length: 61 }, (_, i) =>
      frame([tank({ x: i })]),
    );
    const events: SceneEvent[][] = frames.map((_, i) =>
      i === 30 ? [{ type: "explode", x: 30, y: 0, radius: 2 }] : [],
    );
    const sounds: SoundName[][] = frames.map((_, i) =>
      i === 30 ? ["explode"] : [],
    );
    return { frames, events, sounds };
  }

  function play(startMs: number, tickMs: number, ticks = 10_000) {
    const shown: number[] = [];
    const emitted: SceneEvent[] = [];
    const played: SoundName[] = [];
    let doneAt: number | null = null;
    let clock = startMs;
    const player = replayPlayer(oneSecond(), startMs, 64, {
      frame: (next) => shown.push(next.tanks[0]?.x ?? -1),
      events: (next) => emitted.push(...next),
      sound: (sound) => played.push(sound),
      done: () => {
        doneAt = clock;
      },
    });
    for (let i = 0; i < ticks && doneAt === null; i++) {
      clock += tickMs;
      player.advance(tickMs);
    }
    return { shown, emitted, played, doneAt: doneAt as number | null };
  }

  test("ends on schedule at eight frames per second by skipping frames", () => {
    const slow = play(0, 125);
    expect(slow.doneAt).toBe(1000);
    expect(slow.shown).toEqual([0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60]);
    expect(slow.emitted).toEqual([{ type: "explode", x: 30, y: 0, radius: 2 }]);
    expect(slow.played).toEqual(["explode"]);
  });

  test("interpolates smoothly at high frame rates and still ends on time", () => {
    const fast = play(0, 4);
    expect(fast.doneAt).toBe(1000);
    expect(fast.shown.length).toBe(251);
    for (let i = 1; i < fast.shown.length; i++) {
      expect((fast.shown[i] ?? 0) - (fast.shown[i - 1] ?? 0)).toBeCloseTo(
        0.24,
        6,
      );
    }
  });

  test("resumes mid replay and drops stale sounds after a stall", () => {
    const late = play(400, 600, 1);
    expect(late.shown[0]).toBe(24);
    expect(late.doneAt).toBe(1000);
    expect(late.emitted).toEqual([{ type: "explode", x: 30, y: 0, radius: 2 }]);
    expect(late.played).toEqual([]);
  });
});

describe("event mapping", () => {
  const before = frame(
    [tank({ role: "p1", x: 5, y: 0 }), tank({ role: "p2", x: 20, y: 0 })],
    { pickups: [{ id: "4", kind: "repair", x: 6, y: 2 }] },
  );
  const after = frame(
    [tank({ role: "p1", x: 63.5, y: 1 }), tank({ role: "p2", x: 20, y: 0 })],
    {
      walls: [{ id: "p2", x0: 21, y0: 0, x1: 21, y1: 3, color: 0 }],
    },
  );
  const ctx = {
    width: 64,
    localRole: "p1",
    colors: new Map([
      ["p1", 0x111111],
      ["p2", 0x222222],
    ]),
    names: new Map(),
    kinds: new Map(),
  } satisfies Parameters<typeof sceneEvents>[3];

  test("maps simulation events onto scene effects", () => {
    const events: SimEvent[] = [
      { type: "damage", role: "p2", amount: 12, source: "p1" },
      { type: "explode", x: 1, y: 2, radius: 2.5, cause: "mine", owner: null },
      {
        type: "explode",
        x: 3,
        y: 4,
        radius: 3.2,
        cause: "selfDestruct",
        owner: "p2",
      },
      { type: "explode", x: 5, y: 6, radius: 3, cause: "missile", owner: "p1" },
      { type: "pickup", role: "p1", id: 4, kind: "repair" },
      { type: "wrap", entity: "tank", id: "p1", fromX: 0.2, toX: 63.5 },
      { type: "land", role: "p1" },
      { type: "wall", role: "p2" },
      { type: "split", id: 3, x: 9, y: 9 },
      { type: "absorb", role: "p2", amount: 5 },
    ];
    const mapped = sceneEvents(events, before, after, ctx);
    expect(mapped).toEqual([
      { type: "damage", role: "p2", amount: 12, color: 0x222222 },
      { type: "mine", x: 1, y: 2 },
      { type: "eliminate", role: "p2", x: 3, y: 4 },
      { type: "explode", x: 5, y: 6, radius: 3 },
      { type: "pickup", x: 6, y: 2, kind: "repair" },
      { type: "portal", y: 1.9 },
      { type: "land", role: "p1", x: 63.5, y: 1 },
      { type: "wall", x: 21, y: 1.5 },
      { type: "split", x: 9, y: 9 },
      { type: "shield", role: "p2" },
    ]);
  });

  test("sounds are deduplicated per frame and mines replace blasts", () => {
    const events: SimEvent[] = [
      { type: "fire", role: "p1", id: 1, kind: "shell", x: 0, y: 0 },
      { type: "fire", role: "p1", id: 2, kind: "shell", x: 0, y: 0 },
      { type: "explode", x: 0, y: 0, radius: 2.5, cause: "mine", owner: null },
      { type: "mine", id: 1, x: 0, y: 0 },
      { type: "wrap", entity: "projectile", id: 2, fromX: 0, toX: 63 },
      { type: "airstrike", x: 10 },
      { type: "split", id: 2, x: 0, y: 0 },
    ];
    expect(eventSounds(events)).toEqual([
      "fire",
      "mine",
      "portal",
      "siren",
      "cluster",
    ]);
  });
});

describe("projectile splashes", () => {
  test("shots that vanish at the waterline splash and others do not", () => {
    const shot = (id: string, y: number) => ({
      id,
      kind: "missile" as const,
      x: 12,
      y,
      vx: 0,
      vy: -20,
      color: 0,
    });
    const previous = frame([], {
      projectiles: [shot("1", -5.6), shot("2", 4), shot("3", -5.7)],
    });
    const current = frame([], { projectiles: [shot("3", -6.2)] });
    expect(projectileSplashes(previous, current)).toEqual([
      { type: "splash", x: 12 },
    ]);
  });
});
