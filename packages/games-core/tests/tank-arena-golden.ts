import { checksum } from "@kyzen/physics";
import type { TankAction, TankArenaState } from "@kyzen/shared/types";
import {
  canUse,
  type Frame,
  resolutionInput,
  simulateRound,
} from "../src/index";
import {
  apply,
  engine,
  input,
  lock,
  plan,
  started,
  tank,
} from "./tank-arena-fixtures";

export const GOLDEN: Record<string, number> = {
  state: 1773733475,
  frames: 1101345725,
  jumps: 3346126993,
};

const SCRIPT: Record<string, [TankAction, number, number][]> = {
  p1: [
    ["missile", 40, 0.7],
    ["specialA", 45, 0.75],
    ["shield", 90, 0.5],
    ["missile", 135, 0.8],
    ["specialB", 0, 0.5],
    ["missile", 60, 0.9],
  ],
  p2: [
    ["missile", 140, 0.65],
    ["jump", 70, 0.5],
    ["specialA", 120, 0.6],
    ["missile", 30, 1],
    ["specialB", 100, 0.7],
    ["shield", 90, 0.5],
  ],
  p3: [
    ["specialA", 60, 0.8],
    ["missile", 150, 0.55],
    ["jump", 110, 0.8],
    ["specialB", 80, 0.9],
    ["missile", 10, 1],
    ["missile", 170, 0.45],
  ],
  p4: [
    ["jump", 70, 0.5],
    ["specialB", 180, 0.5],
    ["missile", 100, 0.75],
    ["specialA", 20, 0.95],
    ["missile", -10, 1],
    ["jump", 30, 1],
  ],
};

export function scripted(): { state: TankArenaState; frames: Frame[] } {
  let state = started(["bastion", "kestrel", "kestrel", "bastion"], {
    teams: true,
    seed: 2026,
  });
  let frames: Frame[] = [];
  for (let round = 1; round <= 6 && state.phase === "plan"; round++) {
    for (const role of engine.pendingRoles?.(state) ?? []) {
      const [action, angle, power] = SCRIPT[role]?.[round - 1] ?? [
        "idle",
        90,
        0.5,
      ];
      const move = canUse(state, role, action)
        ? lock(round, action, angle, power)
        : lock(round, "missile", angle, power);
      state = apply(state, role, move);
    }
    const replay = resolutionInput(state);
    frames = [];
    if (replay) simulateRound(replay, (frame) => frames.push(frame));
  }
  return { state, frames };
}

function text(value: unknown): number[] {
  return Array.from(JSON.stringify(value), (char) => char.charCodeAt(0));
}

function frameValues(frames: readonly Frame[]): number[] {
  const values: number[] = [];
  for (const frame of frames) {
    values.push(frame.step);
    for (const t of frame.tanks) values.push(t.x, t.y, t.vx, t.vy, t.hp);
    for (const p of frame.projectiles) values.push(p.id, p.x, p.y, p.vx, p.vy);
  }
  return values;
}

function jumps(): number[] {
  const values: number[] = [];
  for (const [kind, x] of [
    ["bastion", 7],
    ["kestrel", 25],
    ["kestrel", 60.5],
  ] as const) {
    const frames: Frame[] = [];
    simulateRound(
      input([tank("p1", kind, x)], { p1: plan("jump", 68, 0.85) }),
      (frame) => frames.push(frame),
    );
    values.push(...frameValues(frames));
  }
  return values;
}

export function measure(): Record<string, number> {
  const { state, frames } = scripted();
  return {
    state: checksum(text(state)),
    frames: checksum(frameValues(frames)),
    jumps: checksum(jumps()),
  };
}
