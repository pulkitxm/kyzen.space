import type {
  TankArenaAirstrike,
  TankArenaMine,
  TankArenaPickup,
  TankArenaPlan,
  TankArenaTank,
  TankKind,
  TankPickupKind,
} from "@kyzen/shared/types";
import { lineOfSight, MODULE_BOXES, sweepBox, sweepTerrain } from "./arena";
import {
  ACTION_MAX_STEPS,
  AIRSTRIKE_MAX_STEPS,
  BLASTS,
  type BlastKind,
  BOMB_SPAWN_VY,
  BOMB_SPAWN_Y,
  CLUSTER_OFFSETS,
  FRICTION,
  GRAVITY,
  LEAP_SPEED_FACTOR,
  MIN_FALLOFF,
  MINE_RADIUS,
  MINE_TRIGGER_DISTANCE,
  MODULE_WIDTH,
  MORTAR_FAN_DEG,
  OVERCHARGE_FACTOR,
  PICKUP_RADIUS,
  PLATING_FACTOR,
  PLATING_ROUNDS,
  PROJECTILE_LIFETIME_STEPS,
  REPAIR_HP,
  REST_SPEED,
  REST_STEPS,
  RESTITUTION,
  SELF_DAMAGE_FACTOR,
  SELF_DESTRUCT_MAX_STEPS,
  SHIELD_MARGIN,
  STEP,
  TANKS,
  type TankSpec,
  WALL_DISTANCE,
  WALL_LENGTH,
  WALL_SPEED_KEEP,
  WATER_Y,
} from "./constants";
import { dcos, deriveRng, dsin, wrapDelta, wrapX } from "./math";

export type RoundSeat = { role: string; team: string };

export type RoundInput = {
  seed: number;
  round: number;
  modules: number;
  seats: readonly RoundSeat[];
  tanks: readonly TankArenaTank[];
  pickups: readonly TankArenaPickup[];
  mines: readonly TankArenaMine[];
  airstrike: TankArenaAirstrike | null;
  plans: Readonly<Record<string, TankArenaPlan>>;
};

export type ProjectileKind =
  | "missile"
  | "shell"
  | "rocket"
  | "bomblet"
  | "bomb";

export type SimPhase = "action" | "airstrike" | "selfDestruct";

export type SimEvent =
  | {
      type: "fire";
      role: string;
      id: number;
      kind: ProjectileKind;
      x: number;
      y: number;
    }
  | {
      type: "explode";
      x: number;
      y: number;
      radius: number;
      cause: BlastKind;
      owner: string | null;
    }
  | { type: "damage"; role: string; amount: number; source: string | null }
  | { type: "absorb"; role: string; amount: number }
  | { type: "reflect"; role: string; id: number; x: number; y: number }
  | { type: "pickup"; role: string; id: number; kind: TankPickupKind }
  | { type: "mine"; id: number; x: number; y: number }
  | {
      type: "wrap";
      entity: "tank" | "projectile";
      id: string | number;
      fromX: number;
      toX: number;
    }
  | { type: "splash"; role: string; x: number }
  | { type: "land"; role: string }
  | { type: "airstrike"; x: number }
  | { type: "selfDestruct"; role: string }
  | { type: "jump"; role: string }
  | { type: "leap"; role: string }
  | { type: "shield"; role: string }
  | { type: "wall"; role: string }
  | { type: "split"; id: number; x: number; y: number };

export type FrameTank = {
  role: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  shield: number;
  airborne: boolean;
  alive: boolean;
  fell: boolean;
  angle?: number;
};

export type FrameProjectile = {
  id: number;
  kind: ProjectileKind;
  owner: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type FrameWall = {
  role: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type Frame = {
  step: number;
  phase: SimPhase;
  tanks: FrameTank[];
  projectiles: FrameProjectile[];
  walls: FrameWall[];
  mines: TankArenaMine[];
  pickups: TankArenaPickup[];
  events: SimEvent[];
};

export type RoundTank = {
  role: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  fell: boolean;
  forfeited: boolean;
  selfDestructed: boolean;
  collectedPlating: boolean;
  cooldowns: { specialA: number; specialB: number };
  effects: { overcharge: boolean; platingRounds: number };
};

export type RoundResult = {
  steps: number;
  tanks: RoundTank[];
  pickups: TankArenaPickup[];
  mines: TankArenaMine[];
  events: SimEvent[];
};

export type BodyState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hw: number;
  hh: number;
  supported: boolean;
};

type SimTank = BodyState & {
  role: string;
  team: string;
  kind: TankKind;
  spec: TankSpec;
  hp: number;
  shield: number;
  shieldRadius: number;
  rest: number;
  present: boolean;
  fell: boolean;
  selfDestructed: boolean;
  forfeiting: boolean;
  leaping: boolean;
  angle: number | null;
  overcharge: boolean;
  platingRounds: number;
  cooldownA: number;
  cooldownB: number;
  collectedPlating: boolean;
};

type Projectile = {
  id: number;
  kind: ProjectileKind;
  owner: SimTank | null;
  team: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  mult: number;
  alive: boolean;
};

type Wall = {
  owner: SimTank;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  nx: number;
  ny: number;
};

type SimMine = TankArenaMine & { detonated: boolean };
type SimPickup = TankArenaPickup & { taken: boolean };

type PendingMine = {
  mine: SimMine;
  owner: SimTank | null;
  team: string | null;
  toucher: SimTank | null;
};

type World = {
  width: number;
  modules: number;
  tanks: SimTank[];
  projectiles: Projectile[];
  nextProjectileId: number;
  walls: Wall[];
  mines: SimMine[];
  pickups: SimPickup[];
  tankBuckets: SimTank[][];
  mineBuckets: SimMine[][];
  wallBuckets: Wall[][];
  pendingMines: PendingMine[];
  events: SimEvent[];
  allEvents: SimEvent[];
};

const QUERY_MARGIN = 2.5;
const BLAST_NUDGE = 0.02;

export function shieldRadius(kind: TankKind): number {
  return TANKS[kind].halfWidth + SHIELD_MARGIN;
}

export function muzzleDistance(kind: TankKind): number {
  const spec = TANKS[kind];
  return (
    Math.sqrt(
      spec.halfWidth * spec.halfWidth + spec.halfHeight * spec.halfHeight,
    ) + 0.2
  );
}

function spreadFor(
  input: Pick<RoundInput, "seed" | "round">,
  role: string,
  kind: TankKind,
): number {
  const rng = deriveRng(input.seed, input.round, role, "spread");
  return (rng() * 2 - 1) * TANKS[kind].spreadDeg;
}

function moduleIndex(x: number, modules: number): number {
  const index = Math.floor(x / MODULE_WIDTH);
  return index < 0 ? 0 : index >= modules ? modules - 1 : index;
}

function moduleRange(xMin: number, xMax: number, modules: number): number[] {
  const out: number[] = [];
  const first = Math.floor(xMin / MODULE_WIDTH);
  const last = Math.floor(xMax / MODULE_WIDTH);
  for (let k = first; k <= last; k++) {
    let m = k % modules;
    if (m < 0) m += modules;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

export function boxDistance(
  px: number,
  py: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): number {
  const dx = Math.max(Math.abs(px - bx) - hw, 0);
  const dy = Math.max(Math.abs(py - by) - hh, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function boxTouchesCircle(
  bx: number,
  by: number,
  hw: number,
  hh: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const qx = Math.min(Math.max(cx, bx - hw), bx + hw);
  const qy = Math.min(Math.max(cy, by - hh), by + hh);
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy < r * r;
}

function sweepCircle(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number,
  insideHits: boolean,
): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return insideHits ? 0 : -1;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

function sweepSegment(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const ex = bx - ax;
  const ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (denom === 0) return -1;
  const t = ((ax - x0) * ey - (ay - y0) * ex) / denom;
  const u = ((ax - x0) * dy - (ay - y0) * dx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

export type BodyStep = { landed: boolean; wrappedFrom: number | null };

export function stepBody(body: BodyState, width: number): BodyStep {
  const wasAirborne = !body.supported;
  if (body.supported) {
    const slow = FRICTION * STEP;
    if (body.vx > slow) body.vx -= slow;
    else if (body.vx < -slow) body.vx += slow;
    else body.vx = 0;
  }
  body.vy -= GRAVITY * STEP;
  const dx = body.vx * STEP;
  if (dx !== 0) moveBodyX(body, dx);
  body.supported = false;
  const dy = body.vy * STEP;
  if (dy !== 0) moveBodyY(body, dy);
  let wrappedFrom: number | null = null;
  if (body.x < 0 || body.x >= width) {
    wrappedFrom = body.x;
    body.x = wrapX(body.x, width);
  }
  return { landed: wasAirborne && body.supported, wrappedFrom };
}

function moveBodyX(body: BodyState, dx: number): void {
  const bottom = body.y - body.hh + 1e-6;
  const top = body.y + body.hh - 1e-6;
  const lead = dx > 0 ? body.x + body.hw : body.x - body.hw;
  const target = lead + dx;
  let limit = target;
  const first = Math.floor(Math.min(lead, target) / MODULE_WIDTH);
  const last = Math.floor(Math.max(lead, target) / MODULE_WIDTH);
  for (let k = first; k <= last; k++) {
    const shift = k * MODULE_WIDTH;
    for (const box of MODULE_BOXES) {
      if (box.y1 <= bottom || box.y0 >= top) continue;
      if (dx > 0) {
        const face = box.x0 + shift;
        if (face >= lead - 1e-6 && face < limit) limit = face;
      } else {
        const face = box.x1 + shift;
        if (face <= lead + 1e-6 && face > limit) limit = face;
      }
    }
  }
  if (limit === target) {
    body.x += dx;
    return;
  }
  body.x = dx > 0 ? limit - body.hw : limit + body.hw;
  body.vx = -body.vx * RESTITUTION;
}

function moveBodyY(body: BodyState, dy: number): void {
  const left = body.x - body.hw + 1e-6;
  const right = body.x + body.hw - 1e-6;
  const lead = dy > 0 ? body.y + body.hh : body.y - body.hh;
  const target = lead + dy;
  let limit = target;
  const first = Math.floor(left / MODULE_WIDTH);
  const last = Math.floor(right / MODULE_WIDTH);
  for (let k = first; k <= last; k++) {
    const shift = k * MODULE_WIDTH;
    for (const box of MODULE_BOXES) {
      if (box.x1 + shift <= left || box.x0 + shift >= right) continue;
      if (dy > 0) {
        if (box.y0 >= lead - 1e-6 && box.y0 < limit) limit = box.y0;
      } else if (box.y1 <= lead + 1e-6 && box.y1 > limit) limit = box.y1;
    }
  }
  if (limit === target) {
    body.y += dy;
    return;
  }
  if (dy > 0) {
    body.y = limit - body.hh;
    body.vy = -body.vy * RESTITUTION;
  } else {
    body.y = limit + body.hh;
    body.vy = 0;
    body.supported = true;
  }
}

function isSupported(body: BodyState): boolean {
  const left = body.x - body.hw;
  const right = body.x + body.hw;
  const bottom = body.y - body.hh;
  const first = Math.floor(left / MODULE_WIDTH);
  const last = Math.floor(right / MODULE_WIDTH);
  for (let k = first; k <= last; k++) {
    const shift = k * MODULE_WIDTH;
    for (const box of MODULE_BOXES) {
      if (
        box.x1 + shift > left + 1e-6 &&
        box.x0 + shift < right - 1e-6 &&
        Math.abs(bottom - box.y1) <= 1e-3
      )
        return true;
    }
  }
  return false;
}

function createWorld(input: RoundInput): World {
  const width = input.modules * MODULE_WIDTH;
  const teams = new Map(input.seats.map((seat) => [seat.role, seat.team]));
  const tanks: SimTank[] = [];
  for (const tank of input.tanks) {
    if (!tank.alive || !tank.kind) continue;
    const spec = TANKS[tank.kind];
    const body: SimTank = {
      role: tank.role,
      team: teams.get(tank.role) ?? tank.role,
      kind: tank.kind,
      spec,
      x: tank.x,
      y: tank.y,
      vx: tank.vx,
      vy: tank.vy,
      hw: spec.halfWidth,
      hh: spec.halfHeight,
      supported: false,
      hp: tank.hp,
      shield: 0,
      shieldRadius: shieldRadius(tank.kind),
      rest: 0,
      present: true,
      fell: false,
      selfDestructed: false,
      forfeiting: false,
      leaping: false,
      angle: null,
      overcharge: tank.effects.overcharge,
      platingRounds: tank.effects.platingRounds,
      cooldownA: tank.cooldowns.specialA,
      cooldownB: tank.cooldowns.specialB,
      collectedPlating: false,
    };
    body.supported = isSupported(body);
    tanks.push(body);
  }
  const mines = input.mines.map((mine) => ({ ...mine, detonated: false }));
  const mineBuckets: SimMine[][] = Array.from(
    { length: input.modules },
    () => [],
  );
  for (const mine of mines)
    mineBuckets[moduleIndex(mine.x, input.modules)]?.push(mine);
  return {
    width,
    modules: input.modules,
    tanks,
    projectiles: [],
    nextProjectileId: 1,
    walls: [],
    mines,
    pickups: input.pickups.map((pickup) => ({ ...pickup, taken: false })),
    tankBuckets: [],
    mineBuckets,
    wallBuckets: Array.from({ length: input.modules }, () => []),
    pendingMines: [],
    events: [],
    allEvents: [],
  };
}

function untouchable(tank: SimTank): boolean {
  return tank.leaping && !tank.supported;
}

function launch(tank: SimTank, angle: number, speed: number): void {
  tank.vx = dcos(angle) * speed;
  tank.vy = dsin(angle) * speed;
  tank.supported = false;
  tank.rest = 0;
}

function spawnProjectile(
  w: World,
  kind: ProjectileKind,
  owner: SimTank | null,
  team: string | null,
  x: number,
  y: number,
  vx: number,
  vy: number,
  mult: number,
): Projectile {
  const projectile: Projectile = {
    id: w.nextProjectileId++,
    kind,
    owner,
    team,
    x: wrapX(x, w.width),
    y,
    vx,
    vy,
    age: 0,
    mult,
    alive: true,
  };
  w.projectiles.push(projectile);
  return projectile;
}

function fireShots(
  w: World,
  input: RoundInput,
  tank: SimTank,
  plan: TankArenaPlan,
  kind: ProjectileKind,
  offsets: readonly number[],
): void {
  const base = plan.angle + spreadFor(input, tank.role, tank.kind);
  const mult = tank.overcharge ? OVERCHARGE_FACTOR : 1;
  tank.overcharge = false;
  const distance = muzzleDistance(tank.kind);
  const speed = plan.power * tank.spec.maxShotSpeed;
  for (const offset of offsets) {
    const c = dcos(base + offset);
    const s = dsin(base + offset);
    const projectile = spawnProjectile(
      w,
      kind,
      tank,
      tank.team,
      tank.x + c * distance,
      tank.y + s * distance,
      c * speed,
      s * speed,
      mult,
    );
    w.events.push({
      type: "fire",
      role: tank.role,
      id: projectile.id,
      kind,
      x: projectile.x,
      y: projectile.y,
    });
  }
}

function plantWall(w: World, tank: SimTank, angle: number): void {
  const c = dcos(angle);
  const s = dsin(angle);
  const half = WALL_LENGTH / 2;
  const rawX = tank.x + c * WALL_DISTANCE;
  const cx = wrapX(rawX, w.width);
  const shift = cx - rawX;
  const cy = tank.y + s * WALL_DISTANCE;
  const wall: Wall = {
    owner: tank,
    x0: rawX + shift + s * half,
    y0: cy - c * half,
    x1: rawX + shift - s * half,
    y1: cy + c * half,
    cx,
    nx: c,
    ny: s,
  };
  w.walls.push(wall);
  w.wallBuckets[moduleIndex(cx, w.modules)]?.push(wall);
  w.events.push({ type: "wall", role: tank.role });
}

function applyPlans(w: World, input: RoundInput): void {
  for (const tank of w.tanks) {
    const plan = input.plans[tank.role];
    if (!plan) continue;
    tank.angle = plan.angle;
    const spec = tank.spec;
    switch (plan.action) {
      case "forfeit":
        tank.forfeiting = true;
        break;
      case "missile":
        fireShots(w, input, tank, plan, "missile", [0]);
        break;
      case "jump":
        launch(tank, plan.angle, plan.power * spec.maxJumpSpeed);
        w.events.push({ type: "jump", role: tank.role });
        break;
      case "shield":
        tank.shield = spec.shieldCapacity;
        w.events.push({ type: "shield", role: tank.role });
        break;
      case "specialA":
        tank.cooldownA = spec.specialA.cooldown + 1;
        if (tank.kind === "bastion")
          fireShots(w, input, tank, plan, "shell", [
            -MORTAR_FAN_DEG,
            0,
            MORTAR_FAN_DEG,
          ]);
        else fireShots(w, input, tank, plan, "rocket", [0]);
        break;
      case "specialB":
        tank.cooldownB = spec.specialB.cooldown + 1;
        if (tank.kind === "bastion") plantWall(w, tank, plan.angle);
        else {
          launch(
            tank,
            plan.angle,
            plan.power * spec.maxJumpSpeed * LEAP_SPEED_FACTOR,
          );
          tank.leaping = true;
          w.events.push({ type: "leap", role: tank.role });
        }
        break;
      case "idle":
        break;
    }
  }
}

function applyDamage(
  w: World,
  tank: SimTank,
  amount: number,
  source: string | null,
): void {
  if (amount <= 0) return;
  let rest = amount;
  if (tank.shield > 0) {
    const absorbed = Math.min(tank.shield, rest);
    tank.shield -= absorbed;
    rest -= absorbed;
    w.events.push({ type: "absorb", role: tank.role, amount: absorbed });
  }
  if (rest <= 0) return;
  tank.hp -= rest;
  w.events.push({ type: "damage", role: tank.role, amount: rest, source });
}

function explode(
  w: World,
  rawX: number,
  y: number,
  cause: BlastKind,
  owner: SimTank | null,
  team: string | null,
  mult: number,
  toucher: SimTank | null,
): void {
  const spec = BLASTS[cause];
  const x = wrapX(rawX, w.width);
  w.events.push({
    type: "explode",
    x,
    y,
    radius: spec.radius,
    cause,
    owner: owner?.role ?? null,
  });
  const enemiesOnly = cause === "shockwave";
  for (const tank of w.tanks) {
    if (!tank.present || untouchable(tank)) continue;
    const self = tank === owner;
    if (self && enemiesOnly) continue;
    if (!self && team !== null && tank.team === team) continue;
    const tx = x + wrapDelta(x, tank.x, w.width);
    let distance = 0;
    if (tank !== toucher) {
      distance = boxDistance(x, y, tx, tank.y, tank.hw, tank.hh);
      if (distance > spec.radius || !lineOfSight(x, y, tx, tank.y)) continue;
    }
    const falloff = 1 - ((1 - MIN_FALLOFF) * distance) / spec.radius;
    let raw = spec.damage * falloff * mult * (1 - tank.spec.armor);
    if (self) raw *= SELF_DAMAGE_FACTOR;
    if (tank.platingRounds > 0) raw *= PLATING_FACTOR;
    const shielded = tank.shield > 0;
    applyDamage(w, tank, Math.round(raw), owner?.role ?? null);
    const push =
      (spec.knockback * falloff * (shielded ? 0.5 : 1)) / tank.spec.mass;
    const ddx = tx - x;
    const ddy = tank.y - y;
    const length = Math.sqrt(ddx * ddx + ddy * ddy);
    const nx = length < 1e-6 ? 0 : ddx / length;
    const ny = length < 1e-6 ? 1 : ddy / length;
    tank.vx += push * nx;
    tank.vy += push * ny;
    if (push * ny > 0) tank.supported = false;
    tank.rest = 0;
  }
  for (const mine of w.mines) {
    if (mine.detonated) continue;
    const dx = wrapDelta(x, mine.x, w.width);
    const dy = mine.y - y;
    if (dx * dx + dy * dy <= MINE_TRIGGER_DISTANCE * MINE_TRIGGER_DISTANCE)
      w.pendingMines.push({ mine, owner, team, toucher: null });
  }
}

function drainMines(w: World): void {
  while (w.pendingMines.length > 0) {
    const next = w.pendingMines.shift();
    if (!next || next.mine.detonated) continue;
    next.mine.detonated = true;
    w.events.push({
      type: "mine",
      id: next.mine.id,
      x: next.mine.x,
      y: next.mine.y,
    });
    explode(
      w,
      next.mine.x,
      next.mine.y,
      "mine",
      next.owner,
      next.team,
      1,
      next.toucher,
    );
  }
}

function blast(
  w: World,
  x: number,
  y: number,
  cause: BlastKind,
  owner: SimTank | null,
  team: string | null,
  mult: number,
): void {
  explode(w, x, y, cause, owner, team, mult, null);
  drainMines(w);
}

function rebuildTankBuckets(w: World): void {
  const buckets: SimTank[][] = Array.from({ length: w.modules }, () => []);
  for (const tank of w.tanks)
    if (tank.present) buckets[moduleIndex(tank.x, w.modules)]?.push(tank);
  w.tankBuckets = buckets;
}

function moveTanks(w: World): SimTank[] {
  const landings: SimTank[] = [];
  for (const tank of w.tanks) {
    if (!tank.present) continue;
    const result = stepBody(tank, w.width);
    if (result.wrappedFrom !== null)
      w.events.push({
        type: "wrap",
        entity: "tank",
        id: tank.role,
        fromX: result.wrappedFrom,
        toX: tank.x,
      });
    if (tank.y < WATER_Y) {
      tank.present = false;
      tank.fell = true;
      tank.leaping = false;
      w.events.push({ type: "splash", role: tank.role, x: tank.x });
      continue;
    }
    if (result.landed) {
      w.events.push({ type: "land", role: tank.role });
      if (tank.leaping) {
        tank.leaping = false;
        landings.push(tank);
      }
    }
  }
  return landings;
}

function touchMines(w: World): void {
  for (const tank of w.tanks) {
    if (!tank.present || untouchable(tank)) continue;
    for (const m of moduleRange(
      tank.x - tank.hw - MINE_RADIUS,
      tank.x + tank.hw + MINE_RADIUS,
      w.modules,
    )) {
      for (const mine of w.mineBuckets[m] ?? []) {
        if (mine.detonated) continue;
        const mx = tank.x + wrapDelta(tank.x, mine.x, w.width);
        if (
          !boxTouchesCircle(
            tank.x,
            tank.y,
            tank.hw,
            tank.hh,
            mx,
            mine.y,
            MINE_RADIUS,
          )
        )
          continue;
        w.pendingMines.push({ mine, owner: null, team: null, toucher: tank });
        drainMines(w);
      }
    }
  }
}

function collectPickup(w: World, tank: SimTank, pickup: SimPickup): void {
  pickup.taken = true;
  w.events.push({
    type: "pickup",
    role: tank.role,
    id: pickup.id,
    kind: pickup.kind,
  });
  switch (pickup.kind) {
    case "repair":
      tank.hp = Math.min(tank.spec.maxHp, tank.hp + REPAIR_HP);
      break;
    case "overcharge":
      tank.overcharge = true;
      break;
    case "plating":
      tank.platingRounds = PLATING_ROUNDS;
      tank.collectedPlating = true;
      break;
    case "coolant":
      tank.cooldownA = 0;
      tank.cooldownB = 0;
      break;
  }
}

function touchPickups(w: World): void {
  for (const pickup of w.pickups) {
    if (pickup.taken) continue;
    let winner: SimTank | null = null;
    let winnerDistance = 0;
    for (const m of moduleRange(
      pickup.x - QUERY_MARGIN,
      pickup.x + QUERY_MARGIN,
      w.modules,
    )) {
      for (const tank of w.tankBuckets[m] ?? []) {
        if (tank.hp <= 0) continue;
        const tx = pickup.x + wrapDelta(pickup.x, tank.x, w.width);
        if (
          !boxTouchesCircle(
            tx,
            tank.y,
            tank.hw,
            tank.hh,
            pickup.x,
            pickup.y,
            PICKUP_RADIUS,
          )
        )
          continue;
        const dx = tx - pickup.x;
        const dy = tank.y - pickup.y;
        const distance = dx * dx + dy * dy;
        if (
          winner === null ||
          distance < winnerDistance ||
          (distance === winnerDistance &&
            w.tanks.indexOf(tank) < w.tanks.indexOf(winner))
        ) {
          winner = tank;
          winnerDistance = distance;
        }
      }
    }
    if (winner) collectPickup(w, winner, pickup);
  }
}

function hostile(team: string | null, other: string): boolean {
  return team === null || team !== other;
}

function moveProjectile(w: World, p: Projectile, spawned: Projectile[]): void {
  p.age += 1;
  p.vy -= GRAVITY * STEP;
  if (p.kind === "rocket" && p.vy <= 0) {
    p.alive = false;
    w.events.push({ type: "split", id: p.id, x: p.x, y: p.y });
    for (const offset of CLUSTER_OFFSETS) {
      const bomblet: Projectile = {
        id: w.nextProjectileId++,
        kind: "bomblet",
        owner: p.owner,
        team: p.team,
        x: p.x,
        y: p.y,
        vx: p.vx + offset,
        vy: p.vy,
        age: p.age,
        mult: p.mult,
        alive: true,
      };
      spawned.push(bomblet);
    }
    return;
  }
  const dx = p.vx * STEP;
  const dy = p.vy * STEP;
  let best = sweepTerrain(p.x, p.y, dx, dy);
  let wall: Wall | null = null;
  const consider = (t: number): boolean => {
    if (t < 0 || (best >= 0 && t >= best)) return false;
    best = t;
    return true;
  };
  const xMin = Math.min(p.x, p.x + dx) - QUERY_MARGIN;
  const xMax = Math.max(p.x, p.x + dx) + QUERY_MARGIN;
  for (const m of moduleRange(xMin, xMax, w.modules)) {
    for (const tank of w.tankBuckets[m] ?? []) {
      if (!tank.present || untouchable(tank) || !hostile(p.team, tank.team))
        continue;
      const tx = p.x + wrapDelta(p.x, tank.x, w.width);
      if (tank.shield > 0) {
        if (
          consider(
            sweepCircle(p.x, p.y, dx, dy, tx, tank.y, tank.shieldRadius, false),
          )
        )
          wall = null;
      }
      if (
        consider(
          sweepBox(
            p.x,
            p.y,
            dx,
            dy,
            tx - tank.hw,
            tank.y - tank.hh,
            tx + tank.hw,
            tank.y + tank.hh,
          ),
        )
      )
        wall = null;
    }
    for (const candidate of w.wallBuckets[m] ?? []) {
      if (!hostile(p.team, candidate.owner.team)) continue;
      const shift =
        wrapDelta(p.x, candidate.cx, w.width) - (candidate.cx - p.x);
      if (
        consider(
          sweepSegment(
            p.x,
            p.y,
            dx,
            dy,
            candidate.x0 + shift,
            candidate.y0,
            candidate.x1 + shift,
            candidate.y1,
          ),
        )
      )
        wall = candidate;
    }
    for (const mine of w.mineBuckets[m] ?? []) {
      if (mine.detonated) continue;
      const mx = p.x + wrapDelta(p.x, mine.x, w.width);
      if (
        consider(sweepCircle(p.x, p.y, dx, dy, mx, mine.y, MINE_RADIUS, true))
      )
        wall = null;
    }
  }
  if (best >= 0 && wall) {
    const hx = p.x + dx * best;
    const hy = p.y + dy * best;
    const dot = p.vx * wall.nx + p.vy * wall.ny;
    p.vx = (p.vx - 2 * dot * wall.nx) * WALL_SPEED_KEEP;
    p.vy = (p.vy - 2 * dot * wall.ny) * WALL_SPEED_KEEP;
    p.owner = wall.owner;
    p.team = wall.owner.team;
    p.x = wrapX(hx, w.width);
    p.y = hy;
    w.events.push({
      type: "reflect",
      role: wall.owner.role,
      id: p.id,
      x: p.x,
      y: p.y,
    });
    return;
  }
  if (best >= 0) {
    const length = Math.sqrt(dx * dx + dy * dy);
    const back = length > 0 ? BLAST_NUDGE / length : 0;
    p.alive = false;
    blast(
      w,
      p.x + dx * (best - back),
      p.y + dy * (best - back),
      p.kind,
      p.owner,
      p.team,
      p.mult,
    );
    return;
  }
  const nextX = p.x + dx;
  p.y += dy;
  if (nextX < 0 || nextX >= w.width) {
    p.x = wrapX(nextX, w.width);
    w.events.push({
      type: "wrap",
      entity: "projectile",
      id: p.id,
      fromX: nextX,
      toX: p.x,
    });
  } else p.x = nextX;
  if (p.y < WATER_Y) {
    p.alive = false;
    return;
  }
  if (p.age >= PROJECTILE_LIFETIME_STEPS) {
    p.alive = false;
    blast(w, p.x, p.y, p.kind, p.owner, p.team, p.mult);
  }
}

function moveProjectiles(w: World): void {
  const spawned: Projectile[] = [];
  for (const projectile of w.projectiles)
    if (projectile.alive) moveProjectile(w, projectile, spawned);
  w.projectiles = w.projectiles.filter((p) => p.alive).concat(spawned);
}

function updateRest(w: World): void {
  const limit = REST_SPEED * REST_SPEED;
  for (const tank of w.tanks) {
    if (!tank.present) continue;
    if (tank.supported && tank.vx * tank.vx + tank.vy * tank.vy < limit)
      tank.rest += 1;
    else tank.rest = 0;
  }
}

function settled(w: World): boolean {
  if (w.projectiles.length > 0) return false;
  for (const tank of w.tanks)
    if (tank.present && tank.rest < REST_STEPS) return false;
  return true;
}

function runStep(w: World): void {
  const landings = moveTanks(w);
  rebuildTankBuckets(w);
  touchMines(w);
  for (const tank of landings)
    if (tank.present) blast(w, tank.x, tank.y, "shockwave", tank, tank.team, 1);
  touchPickups(w);
  moveProjectiles(w);
  updateRest(w);
}

function snapshotFrame(w: World, step: number, phase: SimPhase): Frame {
  return {
    step,
    phase,
    tanks: w.tanks.map((tank) => ({
      role: tank.role,
      x: tank.x,
      y: tank.y,
      vx: tank.vx,
      vy: tank.vy,
      hp: tank.hp,
      shield: tank.shield,
      airborne: !tank.supported,
      alive: tank.present,
      fell: tank.fell,
      ...(tank.angle === null ? {} : { angle: tank.angle }),
    })),
    projectiles: w.projectiles.map((p) => ({
      id: p.id,
      kind: p.kind,
      owner: p.owner?.role ?? null,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
    })),
    walls: w.walls.map((wall) => ({
      role: wall.owner.role,
      x0: wall.x0,
      y0: wall.y0,
      x1: wall.x1,
      y1: wall.y1,
    })),
    mines: w.mines
      .filter((mine) => !mine.detonated)
      .map((mine) => ({ id: mine.id, x: mine.x, y: mine.y })),
    pickups: w.pickups
      .filter((pickup) => !pickup.taken)
      .map((pickup) => ({
        id: pickup.id,
        kind: pickup.kind,
        x: pickup.x,
        y: pickup.y,
      })),
    events: w.events,
  };
}

function runPhase(
  w: World,
  phase: SimPhase,
  maxSteps: number,
  startStep: number,
  onFrame: ((frame: Frame) => void) | undefined,
): number {
  let steps = 0;
  do {
    runStep(w);
    if (onFrame) onFrame(snapshotFrame(w, startStep + steps, phase));
    for (const event of w.events) w.allEvents.push(event);
    w.events = [];
    steps += 1;
  } while (steps < maxSteps && !settled(w));
  w.projectiles = [];
  return steps;
}

function spawnAirstrike(w: World, airstrike: TankArenaAirstrike): void {
  for (const column of airstrike.columns) {
    spawnProjectile(
      w,
      "bomb",
      null,
      null,
      column,
      BOMB_SPAWN_Y,
      0,
      BOMB_SPAWN_VY,
      1,
    );
    w.events.push({ type: "airstrike", x: column });
  }
}

function selfDestruct(w: World): boolean {
  const doomed = w.tanks.filter(
    (tank) => tank.present && tank.hp <= 0 && !tank.forfeiting,
  );
  if (doomed.length === 0) return false;
  for (const tank of doomed) {
    tank.present = false;
    tank.selfDestructed = true;
    w.events.push({ type: "selfDestruct", role: tank.role });
  }
  for (const tank of doomed)
    blast(w, tank.x, tank.y, "selfDestruct", tank, tank.team, 1);
  return true;
}

export function simulateRound(
  input: RoundInput,
  onFrame?: (frame: Frame) => void,
): RoundResult {
  const w = createWorld(input);
  applyPlans(w, input);
  let steps = runPhase(w, "action", ACTION_MAX_STEPS, 0, onFrame);
  if (input.airstrike && input.airstrike.round === input.round) {
    spawnAirstrike(w, input.airstrike);
    steps += runPhase(w, "airstrike", AIRSTRIKE_MAX_STEPS, steps, onFrame);
  }
  if (selfDestruct(w))
    steps += runPhase(
      w,
      "selfDestruct",
      SELF_DESTRUCT_MAX_STEPS,
      steps,
      onFrame,
    );
  return {
    steps,
    tanks: w.tanks.map((tank) => ({
      role: tank.role,
      x: tank.x,
      y: tank.y,
      vx: tank.vx,
      vy: tank.vy,
      hp: tank.hp,
      fell: tank.fell,
      forfeited: tank.forfeiting,
      selfDestructed: tank.selfDestructed,
      collectedPlating: tank.collectedPlating,
      cooldowns: { specialA: tank.cooldownA, specialB: tank.cooldownB },
      effects: {
        overcharge: tank.overcharge,
        platingRounds: tank.platingRounds,
      },
    })),
    pickups: w.pickups
      .filter((pickup) => !pickup.taken)
      .map(({ taken: _taken, ...pickup }) => pickup),
    mines: w.mines
      .filter((mine) => !mine.detonated)
      .map(({ detonated: _detonated, ...mine }) => mine),
    events: w.allEvents,
  };
}

export type TraceTarget = { x: number; y: number; hw: number; hh: number };

export type TraceHit = {
  kind: "terrain" | "target" | "water" | "timeout" | "apex";
  target: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steps: number;
};

export function traceProjectile(
  width: number,
  startX: number,
  startY: number,
  startVx: number,
  startVy: number,
  targets: readonly TraceTarget[],
  options: {
    maxSteps?: number;
    stopAtApex?: boolean;
    points?: { x: number; y: number }[];
  } = {},
): TraceHit {
  let x = wrapX(startX, width);
  let y = startY;
  const vx = startVx;
  let vy = startVy;
  const maxSteps = options.maxSteps ?? PROJECTILE_LIFETIME_STEPS;
  for (let step = 1; step <= maxSteps; step++) {
    vy -= GRAVITY * STEP;
    if (options.stopAtApex && vy <= 0)
      return { kind: "apex", target: -1, x, y, vx, vy, steps: step };
    const dx = vx * STEP;
    const dy = vy * STEP;
    let best = sweepTerrain(x, y, dx, dy);
    let target = -1;
    for (let i = 0; i < targets.length; i++) {
      const candidate = targets[i];
      if (!candidate) continue;
      const tx = x + wrapDelta(x, candidate.x, width);
      const t = sweepBox(
        x,
        y,
        dx,
        dy,
        tx - candidate.hw,
        candidate.y - candidate.hh,
        tx + candidate.hw,
        candidate.y + candidate.hh,
      );
      if (t >= 0 && (best < 0 || t < best)) {
        best = t;
        target = i;
      }
    }
    if (best >= 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      const back = length > 0 ? BLAST_NUDGE / length : 0;
      return {
        kind: target >= 0 ? "target" : "terrain",
        target,
        x: wrapX(x + dx * (best - back), width),
        y: y + dy * (best - back),
        vx,
        vy,
        steps: step,
      };
    }
    x = wrapX(x + dx, width);
    y += dy;
    options.points?.push({ x, y });
    if (y < WATER_Y)
      return { kind: "water", target: -1, x, y, vx, vy, steps: step };
  }
  return { kind: "timeout", target: -1, x, y, vx, vy, steps: maxSteps };
}

export function blastFactor(
  width: number,
  bx: number,
  by: number,
  radius: number,
  tx: number,
  ty: number,
  hw: number,
  hh: number,
): number {
  const ix = bx + wrapDelta(bx, tx, width);
  const distance = boxDistance(bx, by, ix, ty, hw, hh);
  if (distance > radius || !lineOfSight(bx, by, ix, ty)) return 0;
  return 1 - ((1 - MIN_FALLOFF) * distance) / radius;
}
