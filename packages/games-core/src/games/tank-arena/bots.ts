import { boxDistance, boxTouchesCircle } from "@kyzen/physics";
import type {
  BotDifficulty,
  TankAction,
  TankArenaMove,
  TankArenaPickup,
  TankArenaState,
  TankArenaTank,
  TankKind,
} from "@kyzen/shared/types";
import { lineOfSight } from "./arena";
import {
  BLASTS,
  type BlastKind,
  CLUSTER_OFFSETS,
  GRAVITY,
  JUMP_MAX_ANGLE,
  JUMP_MIN_ANGLE,
  LEAP_SPEED_FACTOR,
  MIN_POWER,
  MINE_RADIUS,
  MODULE_WIDTH,
  MORTAR_FAN_DEG,
  PICKUP_RADIUS,
  PLATING_FACTOR,
  SELF_DAMAGE_FACTOR,
  TANK_KINDS,
  TANKS,
  WATER_Y,
} from "./constants";
import {
  arenaWidth,
  canUse,
  defaultKind,
  seatIndex,
  secretOf,
} from "./helpers";
import {
  clamp,
  datan2,
  dcos,
  dsin,
  normalizeAngle,
  type Rng,
  secretRng,
  wrapDelta,
} from "./math";
import {
  type BodyState,
  blastFactor,
  muzzleDistance,
  stepBody,
  type TraceHit,
  type TraceTarget,
  traceProjectile,
} from "./simulate";

type State = TankArenaState;
type Move = TankArenaMove;
type LiveTank = TankArenaTank & { kind: TankKind };

type Context = {
  state: State;
  width: number;
  me: LiveTank;
  team: string;
  enemies: LiveTank[];
  targets: TraceTarget[];
  rng: Rng;
};

type Aim = { action: TankAction; angle: number; power: number };
type Scored = Aim & { score: number; damage: number };

const TARGET_LIMIT = 6;
const KILL_BONUS = 15;
const SELF_PENALTY = 1.5;
const SELF_KNOCK_PENALTY = 12;
const MISS_CAP = 60;
const MISS_WEIGHT = 0.2;
const REPOSITION_BELOW = 6;
const REPOSITION_GAIN = 3;
const SHOT_ACTIONS: readonly TankAction[] = ["missile", "specialA"];

function live(tank: TankArenaTank | undefined): tank is LiveTank {
  return tank?.alive === true && tank.kind !== null;
}

function distanceSq(width: number, a: TankArenaTank, b: TankArenaTank): number {
  const dx = wrapDelta(a.x, b.x, width);
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function contextFor(state: State, index: number, rng: Rng): Context | null {
  const me = state.tanks[index];
  const team = state.seats[index]?.team;
  if (!live(me) || team === undefined) return null;
  const width = arenaWidth(state);
  const enemies = state.tanks
    .filter(
      (tank, i): tank is LiveTank =>
        live(tank) && state.seats[i]?.team !== team,
    )
    .sort((a, b) => distanceSq(width, me, a) - distanceSq(width, me, b));
  const targets = enemies.slice(0, TARGET_LIMIT).map((tank) => ({
    x: tank.x,
    y: tank.y,
    hw: TANKS[tank.kind].halfWidth,
    hh: TANKS[tank.kind].halfHeight,
  }));
  return { state, width, me, team, enemies, targets, rng };
}

function lock(state: State, aim: Aim): Move {
  return {
    type: "lock",
    round: state.round,
    action: aim.action,
    angle: clamp(normalizeAngle(aim.angle), -180, 180),
    power: clamp(aim.power, MIN_POWER, 1),
  };
}

function idle(state: State): Move {
  return lock(state, { action: "idle", angle: 90, power: 0.5 });
}

function jumpAngle(angle: number): number {
  return clamp(normalizeAngle(angle), JUMP_MIN_ANGLE, JUMP_MAX_ANGLE);
}

type Impact = { damage: number; miss: number };

function impactOf(ctx: Context, hit: TraceHit, blast: BlastKind): Impact {
  if (hit.kind === "apex") return { damage: 0, miss: MISS_CAP };
  const spec = BLASTS[blast];
  let damage = 0;
  let miss = MISS_CAP;
  for (const enemy of ctx.enemies.slice(0, TARGET_LIMIT)) {
    const enemySpec = TANKS[enemy.kind];
    const dx = wrapDelta(hit.x, enemy.x, ctx.width);
    const dy = enemy.y - hit.y;
    miss = Math.min(miss, Math.sqrt(dx * dx + dy * dy));
    if (hit.kind === "water") continue;
    const factor = blastFactor(
      ctx.width,
      hit.x,
      hit.y,
      spec.radius,
      enemy.x,
      enemy.y,
      enemySpec.halfWidth,
      enemySpec.halfHeight,
    );
    if (factor <= 0) continue;
    let dealt = spec.damage * factor * (1 - enemySpec.armor);
    if (enemy.effects.platingRounds > 0) dealt *= PLATING_FACTOR;
    damage += Math.min(dealt, enemy.hp);
    if (dealt >= enemy.hp) damage += KILL_BONUS;
  }
  if (hit.kind === "water") return { damage: 0, miss: miss + MISS_CAP };
  const mySpec = TANKS[ctx.me.kind];
  const self = blastFactor(
    ctx.width,
    hit.x,
    hit.y,
    spec.radius,
    ctx.me.x,
    ctx.me.y,
    mySpec.halfWidth,
    mySpec.halfHeight,
  );
  if (self > 0)
    damage -=
      SELF_PENALTY *
        spec.damage *
        self *
        SELF_DAMAGE_FACTOR *
        (1 - mySpec.armor) +
      (SELF_KNOCK_PENALTY * self) / mySpec.mass;
  return { damage, miss };
}

function traceFrom(
  ctx: Context,
  angle: number,
  speed: number,
  stopAtApex: boolean,
): TraceHit {
  const distance = muzzleDistance(ctx.me.kind);
  const c = dcos(angle);
  const s = dsin(angle);
  return traceProjectile(
    ctx.width,
    ctx.me.x + c * distance,
    ctx.me.y + s * distance,
    c * speed,
    s * speed,
    ctx.targets,
    { stopAtApex },
  );
}

function volleyOf(ctx: Context, aim: Aim): Impact[] {
  const speed = aim.power * TANKS[ctx.me.kind].maxShotSpeed;
  if (aim.action === "missile")
    return [impactOf(ctx, traceFrom(ctx, aim.angle, speed, false), "missile")];
  if (ctx.me.kind === "bastion")
    return [-MORTAR_FAN_DEG, 0, MORTAR_FAN_DEG].map((offset) =>
      impactOf(ctx, traceFrom(ctx, aim.angle + offset, speed, false), "shell"),
    );
  const rocket = traceFrom(ctx, aim.angle, speed, true);
  if (rocket.kind !== "apex") return [impactOf(ctx, rocket, "rocket")];
  return CLUSTER_OFFSETS.map((offset) =>
    impactOf(
      ctx,
      traceProjectile(
        ctx.width,
        rocket.x,
        rocket.y,
        rocket.vx + offset,
        rocket.vy,
        ctx.targets,
      ),
      "bomblet",
    ),
  );
}

function evaluateShot(ctx: Context, aim: Aim): Scored {
  let damage = 0;
  let miss = MISS_CAP * 2;
  for (const impact of volleyOf(ctx, aim)) {
    damage += impact.damage;
    miss = Math.min(miss, impact.miss);
  }
  return { ...aim, damage, score: damage - MISS_WEIGHT * miss };
}

function refineShot(ctx: Context, start: Scored): Scored {
  let best = start;
  for (const scale of [4, 2, 1, 0.5, 0.25]) {
    let improved = true;
    for (let pass = 0; improved && pass < 3; pass++) {
      improved = false;
      const current = best;
      for (const [da, dp] of [
        [scale, 0],
        [-scale, 0],
        [0, scale * 0.02],
        [0, -scale * 0.02],
      ] as const) {
        const scored = evaluateShot(ctx, {
          action: current.action,
          angle: current.angle + da,
          power: clamp(current.power + dp, MIN_POWER, 1),
        });
        if (scored.score > best.score) {
          best = scored;
          improved = true;
        }
      }
    }
  }
  return best;
}

function bestShot(
  ctx: Context,
  samples: number,
  refineCount: number,
): Scored | null {
  const scored: Scored[] = [];
  for (const action of SHOT_ACTIONS) {
    if (!canUse(ctx.state, ctx.me.role, action)) continue;
    for (let i = 0; i < samples; i++)
      scored.push(
        evaluateShot(ctx, {
          action,
          angle: -30 + ((i + ctx.rng()) * 240) / samples,
          power: 0.3 + ctx.rng() * 0.7,
        }),
      );
  }
  scored.sort((a, b) => b.score - a.score);
  let best = scored[0] ?? null;
  for (const candidate of scored.slice(0, refineCount)) {
    const refined = refineShot(ctx, candidate);
    if (!best || refined.score > best.score) best = refined;
  }
  return best;
}

function analyticAim(ctx: Context, target: LiveTank, power: number): Aim {
  const spec = TANKS[ctx.me.kind];
  const dx = wrapDelta(ctx.me.x, target.x, ctx.width);
  const dy = target.y - ctx.me.y;
  const ax = Math.abs(dx);
  for (const p of [power, 1]) {
    const v = p * spec.maxShotSpeed;
    const v2 = v * v;
    const disc = v2 * v2 - GRAVITY * (GRAVITY * ax * ax + 2 * dy * v2);
    if (disc < 0) continue;
    const angle = datan2(v2 - Math.sqrt(disc), GRAVITY * ax);
    return {
      action: "missile",
      angle: dx < 0 ? 180 - angle : angle,
      power: p,
    };
  }
  return { action: "missile", angle: dx < 0 ? 135 : 45, power: 1 };
}

function enemyThreat(ctx: Context): number {
  let threat = 0;
  for (const enemy of ctx.enemies) {
    if (distanceSq(ctx.width, ctx.me, enemy) > 45 * 45) continue;
    const ex = ctx.me.x + wrapDelta(ctx.me.x, enemy.x, ctx.width);
    if (lineOfSight(ctx.me.x, ctx.me.y, ex, enemy.y)) threat += 22;
  }
  return threat;
}

function mostDangerous(ctx: Context): LiveTank | null {
  for (const enemy of ctx.enemies) {
    const ex = ctx.me.x + wrapDelta(ctx.me.x, enemy.x, ctx.width);
    if (lineOfSight(ctx.me.x, ctx.me.y, ex, enemy.y)) return enemy;
  }
  return null;
}

function landsSafely(body: BodyState, width: number, steps: number): boolean {
  for (let i = 0; i < steps; i++) {
    stepBody(body, width);
    if (body.y < WATER_Y) return false;
    if (body.supported && body.vx === 0) return true;
  }
  return false;
}

function jumpToPickup(ctx: Context, speedFactor: number): Aim | null {
  const spec = TANKS[ctx.me.kind];
  const pickups = [...ctx.state.pickups]
    .map((pickup) => ({
      pickup,
      distance: Math.abs(wrapDelta(ctx.me.x, pickup.x, ctx.width)),
    }))
    .filter((entry) => entry.distance < 24)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
  for (const { pickup } of pickups) {
    for (let angle = 20; angle <= 160; angle += 10)
      for (const power of [0.35, 0.5, 0.65, 0.8, 1]) {
        if (
          reaches(ctx, pickup, angle, power * spec.maxJumpSpeed * speedFactor)
        )
          return { action: "jump", angle, power };
      }
  }
  return null;
}

function reaches(
  ctx: Context,
  pickup: TankArenaPickup,
  angle: number,
  speed: number,
): boolean {
  const spec = TANKS[ctx.me.kind];
  const body: BodyState = {
    x: ctx.me.x,
    y: ctx.me.y,
    vx: dcos(angle) * speed,
    vy: dsin(angle) * speed,
    hw: spec.halfWidth,
    hh: spec.halfHeight,
    supported: false,
  };
  for (let i = 0; i < 240; i++) {
    stepBody(body, ctx.width);
    if (body.y < WATER_Y) return false;
    const px = body.x + wrapDelta(body.x, pickup.x, ctx.width);
    if (
      boxTouchesCircle(
        body.x,
        body.y,
        body.hw,
        body.hh,
        px,
        pickup.y,
        PICKUP_RADIUS,
      )
    )
      return landsSafely(body, ctx.width, 150);
    if (body.supported && body.vx === 0) return false;
  }
  return false;
}

function nearMine(ctx: Context): boolean {
  const spec = TANKS[ctx.me.kind];
  return ctx.state.mines.some((mine) => {
    const mx = ctx.me.x + wrapDelta(ctx.me.x, mine.x, ctx.width);
    return (
      boxDistance(
        mx,
        mine.y,
        ctx.me.x,
        ctx.me.y,
        spec.halfWidth,
        spec.halfHeight,
      ) <
      MINE_RADIUS + 1.5
    );
  });
}

function escapeJump(ctx: Context): Aim | null {
  const spec = TANKS[ctx.me.kind];
  for (const angle of [60, 120, 45, 135, 75, 105])
    for (const power of [0.7, 0.5, 0.9]) {
      const body: BodyState = {
        x: ctx.me.x,
        y: ctx.me.y,
        vx: dcos(angle) * power * spec.maxJumpSpeed,
        vy: dsin(angle) * power * spec.maxJumpSpeed,
        hw: spec.halfWidth,
        hh: spec.halfHeight,
        supported: false,
      };
      if (landsSafely(body, ctx.width, 240))
        return { action: "jump", angle, power };
    }
  return null;
}

function easyPlan(ctx: Context): Move {
  const { state, rng } = ctx;
  if (rng() < 0.15)
    return lock(state, {
      action: "jump",
      angle: 30 + rng() * 120,
      power: 0.4 + rng() * 0.6,
    });
  const target = ctx.enemies[0];
  if (!target) return idle(state);
  const aim = analyticAim(ctx, target, 0.75);
  return lock(state, {
    action: "missile",
    angle: aim.angle + (rng() * 2 - 1) * 18,
    power: aim.power * (1 + (rng() * 2 - 1) * 0.35),
  });
}

function reposition(ctx: Context, current: Scored | null): Aim | null {
  const spec = TANKS[ctx.me.kind];
  let best: Scored | null = null;
  const bar = (current?.score ?? -Infinity) + REPOSITION_GAIN;
  for (const angle of [30, 55, 80, 100, 125, 150])
    for (const power of [0.45, 0.7, 1]) {
      const speed = power * spec.maxJumpSpeed;
      const body: BodyState = {
        x: ctx.me.x,
        y: ctx.me.y,
        vx: dcos(angle) * speed,
        vy: dsin(angle) * speed,
        hw: spec.halfWidth,
        hh: spec.halfHeight,
        supported: false,
      };
      if (!landsSafely(body, ctx.width, 240)) continue;
      const shot = bestShot(
        { ...ctx, me: { ...ctx.me, x: body.x, y: body.y } },
        24,
        0,
      );
      if (shot && shot.score > bar && (!best || shot.score > best.score))
        best = { ...shot, action: "jump", angle, power };
    }
  return best;
}

function normalPlan(ctx: Context): Move {
  const { state, me, rng } = ctx;
  const spec = TANKS[me.kind];
  if (me.hp < spec.maxHp * 0.35 && mostDangerous(ctx))
    return lock(state, { action: "shield", angle: 90, power: 0.5 });
  if (state.pickups.length > 0 && rng() < 0.2) {
    const jump = jumpToPickup(ctx, 1);
    if (jump) return lock(state, jump);
  }
  const best = bestShot(ctx, 32, 0);
  if (!best) return idle(state);
  return lock(state, { ...best, angle: best.angle + (rng() * 2 - 1) * 5 });
}

function hardPlan(ctx: Context): Move {
  const { state, me, rng } = ctx;
  const spec = TANKS[me.kind];
  const threat = enemyThreat(ctx);
  const danger = mostDangerous(ctx);
  if (me.hp < spec.maxHp * 0.4 && threat >= me.hp * 0.5)
    return lock(state, { action: "shield", angle: 90, power: 0.5 });
  if (
    me.kind === "bastion" &&
    danger &&
    canUse(state, me.role, "specialB") &&
    me.hp < spec.maxHp * 0.6
  ) {
    const dx = wrapDelta(me.x, danger.x, ctx.width);
    return lock(state, {
      action: "specialB",
      angle: datan2(danger.y - me.y, dx),
      power: 0.5,
    });
  }
  if (me.kind === "kestrel" && canUse(state, me.role, "specialB")) {
    const close = ctx.enemies.find(
      (enemy) =>
        boxDistance(
          enemy.x + wrapDelta(enemy.x, me.x, ctx.width),
          me.y,
          enemy.x,
          enemy.y,
          TANKS[enemy.kind].halfWidth,
          TANKS[enemy.kind].halfHeight,
        ) < 2.5,
    );
    if (close)
      return lock(state, { action: "specialB", angle: 90, power: 0.3 });
  }
  if (nearMine(ctx)) {
    const exit = escapeJump(ctx);
    if (exit) return lock(state, exit);
  }
  const best = bestShot(ctx, 128, 4);
  if (state.pickups.length > 0 && (!danger || !best || best.damage < 8)) {
    const jump = jumpToPickup(ctx, 1);
    if (jump) return lock(state, jump);
    if (me.kind === "kestrel" && canUse(state, me.role, "specialB")) {
      const leap = jumpToPickup(ctx, LEAP_SPEED_FACTOR);
      if (leap) return lock(state, { ...leap, action: "specialB" });
    }
  }
  if (!best || best.damage < REPOSITION_BELOW) {
    const move = reposition(ctx, best);
    if (move) return lock(state, move);
  }
  if (!best) return idle(state);
  return lock(state, { ...best, angle: best.angle + (rng() * 2 - 1) });
}

function botKind(
  state: State,
  index: number,
  difficulty: BotDifficulty,
  rng: Rng,
): TankKind {
  if (difficulty === "easy")
    return TANK_KINDS[Math.floor(rng() * TANK_KINDS.length)] ?? "bastion";
  const sheltered = (x: number) =>
    x - MODULE_WIDTH * Math.floor(x / MODULE_WIDTH) < MODULE_WIDTH / 2;
  const me = state.tanks[index];
  const team = state.seats[index]?.team;
  if (!me) return defaultKind(index);
  const mine = sheltered(me.x);
  let alike = 0;
  for (let i = 0; i < index; i++)
    if (
      state.seats[i]?.team === team &&
      sheltered(state.tanks[i]?.x ?? 0) === mine
    )
      alike += 1;
  const preferred: TankKind = mine ? "bastion" : "kestrel";
  if (alike % 2 === 0) return preferred;
  return preferred === "bastion" ? "kestrel" : "bastion";
}

function sanitize(state: State, me: LiveTank, move: Move): Move {
  if (move.type !== "lock") return move;
  if (!canUse(state, me.role, move.action)) return idle(state);
  if (
    move.action === "jump" ||
    (move.action === "specialB" && me.kind === "kestrel")
  )
    return { ...move, angle: jumpAngle(move.angle) };
  return move;
}

export function botMove(
  state: State,
  role: string,
  difficulty: BotDifficulty,
): Move {
  const index = seatIndex(state, role);
  const rng = secretRng(secretOf(state), state.round, role, "bot");
  if (state.phase === "select")
    return {
      type: "select",
      round: 0,
      tank: botKind(state, Math.max(0, index), difficulty, rng),
    };
  const ctx = index < 0 ? null : contextFor(state, index, rng);
  if (!ctx) return idle(state);
  const move =
    difficulty === "easy"
      ? easyPlan(ctx)
      : difficulty === "normal"
        ? normalPlan(ctx)
        : hardPlan(ctx);
  return sanitize(state, ctx.me, move);
}
