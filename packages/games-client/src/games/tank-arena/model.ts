import {
  canUse,
  cooldownsOf,
  JUMP_MAX_ANGLE,
  JUMP_MIN_ANGLE,
  MIN_POWER,
  MODULE_WIDTH,
  TANKS,
} from "@kyzen/games-core";
import type {
  GameJson,
  TankAction,
  TankArenaState,
  TankArenaTank,
  TankKind,
} from "@kyzen/shared/types";
import { tankArenaStateSchema } from "@kyzen/shared/types";
import { wrappedDelta } from "./camera";

export const DRAG_FULL_POWER = 9;
const ANGLE_STEP = 2;
const POWER_STEP = 0.05;

export const TEAM_PALETTE = [
  0x3edcff, 0xff4d5e, 0xffc23d, 0xa77bff, 0x7dff6a, 0xff7bd5, 0x3dffc0,
  0xff8a3d, 0x6a8bff, 0xe8ff5a, 0xff5ab0, 0x5ae0ff,
] as const;

export type BoardMode =
  | "select"
  | "plan"
  | "locked"
  | "replay"
  | "spectate"
  | "finished";

export type Aim = { angle: number; power: number };

export type RosterEntry = {
  role: string;
  name: string;
  team: string;
  color: number;
  kind: TankKind | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  locked: boolean;
  local: boolean;
  bot: boolean;
};

export function parseTankState(value: unknown): TankArenaState | null {
  const parsed = tankArenaStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function localRoleOf(
  players: GameJson["players"],
  viewerId: string | null,
): string | null {
  if (!viewerId) return null;
  return players.find((player) => player.userId === viewerId)?.role ?? null;
}

export function tankOf(state: TankArenaState, role: string | null) {
  if (!role) return null;
  return state.tanks.find((tank) => tank.role === role) ?? null;
}

function teamOrder(state: TankArenaState): string[] {
  const order: string[] = [];
  for (const seat of state.seats) {
    if (!order.includes(seat.team)) order.push(seat.team);
  }
  return order;
}

export function teamColor(state: TankArenaState, role: string): number {
  const team = state.seats.find((seat) => seat.role === role)?.team ?? role;
  const index = Math.max(0, teamOrder(state).indexOf(team));
  return TEAM_PALETTE[index % TEAM_PALETTE.length] ?? TEAM_PALETTE[0];
}

export function cssColor(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function deriveMode(input: {
  state: TankArenaState;
  localRole: string | null;
  replaying: boolean;
}): BoardMode {
  const { state, localRole, replaying } = input;
  if (replaying) return "replay";
  if (state.phase === "finished") return "finished";
  const me = tankOf(state, localRole);
  if (state.phase === "select") return me ? "select" : "spectate";
  if (!me?.alive) return "spectate";
  if (state.submitted.includes(me.role)) return "locked";
  return "plan";
}

function lockedRoles(state: TankArenaState): Set<string> {
  return new Set(state.submitted);
}

function maxHpOf(tank: Pick<TankArenaTank, "kind">) {
  return tank.kind ? TANKS[tank.kind].maxHp : 0;
}

export function rosterEntries(
  state: TankArenaState,
  players: GameJson["players"],
  localRole: string | null,
): RosterEntry[] {
  const locked = lockedRoles(state);
  return state.seats.map((seat, index) => {
    const tank = state.tanks[index];
    const player = players.find((p) => p.role === seat.role);
    return {
      role: seat.role,
      name: player?.username ?? seat.role.toUpperCase(),
      team: seat.team,
      color: teamColor(state, seat.role),
      kind: tank?.kind ?? null,
      hp: tank?.hp ?? 0,
      maxHp: tank ? maxHpOf(tank) : 0,
      alive: tank?.alive ?? false,
      locked: locked.has(seat.role),
      local: seat.role === localRole,
      bot: seat.bot !== null,
    };
  });
}

export function lockSummary(state: TankArenaState) {
  const living = state.tanks.filter((tank) => tank.alive);
  const locked = living.filter((tank) => state.submitted.includes(tank.role));
  return { locked: locked.length, total: living.length };
}

export type CooldownPips = { total: number; filled: number; ready: boolean };

export function cooldownPips(total: number, remaining: number): CooldownPips {
  const safeTotal = Math.max(0, Math.round(total));
  const left = Math.min(safeTotal, Math.max(0, Math.round(remaining)));
  return { total: safeTotal, filled: safeTotal - left, ready: left === 0 };
}

export type StatBar = {
  key: string;
  label: string;
  value: string;
  fraction: number;
};

const STAT_KEYS = [
  { key: "hp", label: "Health" },
  { key: "mass", label: "Weight" },
  { key: "accuracy", label: "Accuracy" },
  { key: "jump", label: "Jump" },
  { key: "shot", label: "Shot speed" },
  { key: "shield", label: "Shield" },
] as const;

function statValue(kind: TankKind, key: (typeof STAT_KEYS)[number]["key"]) {
  const spec = TANKS[kind];
  switch (key) {
    case "hp":
      return spec.maxHp;
    case "mass":
      return spec.mass;
    case "accuracy":
      return spec.accuracy;
    case "jump":
      return spec.maxJumpSpeed;
    case "shot":
      return spec.maxShotSpeed;
    case "shield":
      return spec.shieldCapacity;
  }
}

export function statBars(kind: TankKind): StatBar[] {
  const kinds = Object.keys(TANKS) as TankKind[];
  return STAT_KEYS.map(({ key, label }) => {
    const value = statValue(kind, key);
    const max =
      key === "accuracy"
        ? 100
        : Math.max(...kinds.map((other) => statValue(other, key)));
    const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    const text = key === "mass" ? `${value.toFixed(2)}x` : `${value}`;
    return { key, label, value: text, fraction };
  });
}

export function secondsLeft(deadline: number | null | undefined, now: number) {
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function normalizeAngle(angle: number) {
  let value = angle;
  while (value > 180) value -= 360;
  while (value <= -180) value += 360;
  return value;
}

export function clampAim(aim: Aim, jumpLike: boolean): Aim {
  let angle = normalizeAngle(aim.angle);
  if (jumpLike) {
    if (angle < JUMP_MIN_ANGLE || angle > JUMP_MAX_ANGLE) {
      angle =
        angle < -90 || angle > JUMP_MAX_ANGLE ? JUMP_MAX_ANGLE : JUMP_MIN_ANGLE;
    }
  }
  const power = Math.min(1, Math.max(MIN_POWER, aim.power));
  return {
    angle: Math.round(angle * 10) / 10,
    power: Math.round(power * 100) / 100,
  };
}

export function aimFromDrag(
  origin: { x: number; y: number },
  point: { x: number; y: number },
  width: number,
  jumpLike: boolean,
): Aim {
  const dx = wrappedDelta(origin.x, point.x, width);
  const dy = point.y - origin.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = length < 1e-6 ? 90 : (Math.atan2(dy, dx) * 180) / Math.PI;
  return clampAim({ angle, power: length / DRAG_FULL_POWER }, jumpLike);
}

export function aimTarget(origin: { x: number; y: number }, aim: Aim) {
  const radians = (aim.angle * Math.PI) / 180;
  const reach = aim.power * DRAG_FULL_POWER;
  return {
    x: origin.x + Math.cos(radians) * reach,
    y: origin.y + Math.sin(radians) * reach,
  };
}

export function nudgeAim(
  aim: Aim,
  key: string,
  shift: boolean,
  jumpLike: boolean,
): Aim | null {
  if (shift) {
    if (key === "ArrowUp" || key === "ArrowRight")
      return clampAim({ ...aim, power: aim.power + POWER_STEP }, jumpLike);
    if (key === "ArrowDown" || key === "ArrowLeft")
      return clampAim({ ...aim, power: aim.power - POWER_STEP }, jumpLike);
    return null;
  }
  const facingRight = Math.cos((aim.angle * Math.PI) / 180) >= 0;
  switch (key) {
    case "ArrowLeft":
      return clampAim({ ...aim, angle: aim.angle + ANGLE_STEP }, jumpLike);
    case "ArrowRight":
      return clampAim({ ...aim, angle: aim.angle - ANGLE_STEP }, jumpLike);
    case "ArrowUp":
      return clampAim(
        { ...aim, angle: aim.angle + (facingRight ? ANGLE_STEP : -ANGLE_STEP) },
        jumpLike,
      );
    case "ArrowDown":
      return clampAim(
        { ...aim, angle: aim.angle + (facingRight ? -ANGLE_STEP : ANGLE_STEP) },
        jumpLike,
      );
    default:
      return null;
  }
}

export function defaultAim(state: TankArenaState, role: string | null): Aim {
  const me = tankOf(state, role);
  if (!me) return { angle: 45, power: 0.6 };
  const width = state.modules * MODULE_WIDTH;
  const myTeam = state.seats.find((seat) => seat.role === me.role)?.team;
  let nearestDx: number | null = null;
  for (let index = 0; index < state.tanks.length; index++) {
    const tank = state.tanks[index];
    if (!tank?.alive || tank.role === me.role) continue;
    if (state.seats[index]?.team === myTeam) continue;
    const dx = wrappedDelta(me.x, tank.x, width);
    if (nearestDx === null || Math.abs(dx) < Math.abs(nearestDx))
      nearestDx = dx;
  }
  const right = nearestDx !== null ? nearestDx >= 0 : me.x < width / 2;
  return { angle: right ? 45 : 135, power: 0.6 };
}

const ACTION_ORDER: TankAction[] = [
  "missile",
  "jump",
  "shield",
  "specialA",
  "specialB",
];

export type ActionInfo = {
  action: TankAction;
  label: string;
  description: string;
  cooldown: number;
  usesPower: boolean;
  usesAngle: boolean;
};

export function actionInfo(
  kind: TankKind | null,
  action: TankAction,
): ActionInfo {
  const spec = kind ? TANKS[kind] : null;
  switch (action) {
    case "missile":
      return {
        action,
        label: "Missile",
        description: "Ballistic shot, 25 damage at the center of the blast.",
        cooldown: 0,
        usesPower: true,
        usesAngle: true,
      };
    case "jump":
      return {
        action,
        label: "Jump",
        description: "Leap along the aimed arc. Must point upward.",
        cooldown: 0,
        usesPower: true,
        usesAngle: true,
      };
    case "shield":
      return {
        action,
        label: "Shield",
        description: spec
          ? `Bubble that absorbs up to ${spec.shieldCapacity} damage and halves knockback.`
          : "Bubble that absorbs damage and halves knockback.",
        cooldown: 0,
        usesPower: false,
        usesAngle: false,
      };
    case "specialA":
      return {
        action,
        label: spec?.specialA.name ?? "Special A",
        description: spec?.specialA.description ?? "Tank special.",
        cooldown: spec?.specialA.cooldown ?? 0,
        usesPower: true,
        usesAngle: true,
      };
    case "specialB":
      return {
        action,
        label: spec?.specialB.name ?? "Special B",
        description: spec?.specialB.description ?? "Tank special.",
        cooldown: spec?.specialB.cooldown ?? 0,
        usesPower: kind !== "bastion",
        usesAngle: true,
      };
    default:
      return {
        action,
        label: "Idle",
        description: "Do nothing this round.",
        cooldown: 0,
        usesPower: false,
        usesAngle: false,
      };
  }
}

export function actionFromKey(key: string): TankAction | null {
  const index = Number.parseInt(key, 10);
  if (!Number.isInteger(index) || index < 1 || index > ACTION_ORDER.length) {
    return null;
  }
  return ACTION_ORDER[index - 1] ?? null;
}

export function airstrikeWarning(state: TankArenaState) {
  const strike = state.airstrike;
  if (!strike || state.phase !== "plan" || strike.round !== state.round) {
    return null;
  }
  return strike;
}

export type ActionSlot = {
  action: TankAction;
  enabled: boolean;
  pips: CooldownPips | null;
};

export function actionSlots(
  state: TankArenaState,
  role: string | null,
): ActionSlot[] {
  const kind = tankOf(state, role)?.kind ?? null;
  const cooldowns = role ? cooldownsOf(state, role) : null;
  return ACTION_ORDER.map((action) => {
    const special = action === "specialA" || action === "specialB";
    const total = kind && special ? TANKS[kind][action].cooldown : 0;
    const remaining = cooldowns && special ? cooldowns[action] : 0;
    return {
      action,
      enabled: Boolean(role && canUse(state, role, action)),
      pips: total > 0 ? cooldownPips(total, remaining) : null,
    };
  });
}
