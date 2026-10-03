import type {
  TankArenaAirstrike,
  TankArenaMine,
  TankArenaPickup,
  TankArenaPlan,
  TankArenaTank,
  TankKind,
  TankPickupKind,
} from "@kyzen/shared/types";
import {
  ACTION_MAX_STEPS,
  AIRSTRIKE_MAX_STEPS,
  BLASTS,
  type BlastKind,
  BOMB_SPAWN_VY,
  BOMB_SPAWN_Y,
  CLUSTER_OFFSETS,
  MINE_TRIGGER_DISTANCE,
  MORTAR_FAN_DEG,
  OVERCHARGE_FACTOR,
  PLATING_FACTOR,
  PLATING_ROUNDS,
  REPAIR_HP,
  SELF_DAMAGE_FACTOR,
  SELF_DESTRUCT_MAX_STEPS,
  TANKS,
  type TankSpec,
  WALL_SPEED_KEEP,
} from "./constants";
import { dcos, deriveRng, dsin } from "./math";
import {
  type ArenaBody,
  type ArenaEvent,
  type ArenaWorld,
  addMine,
  addPickup,
  addShield,
  addShot,
  addTank,
  addWall,
  arenaWorld,
  blastFalloff,
  blastPoint,
  jumpSpeed,
  launchTank,
  muzzlePoint,
  setUntouchable,
  shotFate,
  wallSegment,
} from "./world";

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

type SimTank = {
  role: string;
  team: string;
  group: number;
  kind: TankKind;
  spec: TankSpec;
  body: ArenaBody;
  shieldBody: ArenaBody | null;
  hp: number;
  shield: number;
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
  body: ArenaBody;
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
  nx: number;
  ny: number;
};

type SimMine = TankArenaMine & { detonated: boolean; body: ArenaBody };
type SimPickup = TankArenaPickup & { taken: boolean; body: ArenaBody };

type PendingMine = {
  mine: SimMine;
  owner: SimTank | null;
  team: string | null;
  toucher: SimTank | null;
};

export type Round = {
  world: ArenaWorld;
  tanks: SimTank[];
  projectiles: Projectile[];
  nextProjectileId: number;
  walls: Wall[];
  mines: SimMine[];
  pickups: SimPickup[];
  groups: Map<string, number>;
  spread: boolean;
  pendingMines: PendingMine[];
  events: SimEvent[];
  allEvents: SimEvent[];
};

export function spreadFor(
  input: Pick<RoundInput, "seed" | "round">,
  role: string,
  kind: TankKind,
): number {
  const rng = deriveRng(input.seed, input.round, role, "spread");
  return (rng() * 2 - 1) * TANKS[kind].spreadDeg;
}

function groupOf(r: Round, team: string | null): number {
  return team === null ? 0 : (r.groups.get(team) ?? 0);
}

export function startRound(
  input: RoundInput,
  options: { spread: boolean },
): Round {
  const world = arenaWorld(input.modules);
  const teams = new Map(input.seats.map((seat) => [seat.role, seat.team]));
  const groups = new Map<string, number>();
  for (const seat of input.seats)
    if (!groups.has(seat.team)) groups.set(seat.team, groups.size + 1);
  const tanks: SimTank[] = [];
  for (const tank of input.tanks) {
    if (!tank.alive || !tank.kind) continue;
    const team = teams.get(tank.role) ?? tank.role;
    const group = groups.get(team) ?? 0;
    tanks.push({
      role: tank.role,
      team,
      group,
      kind: tank.kind,
      spec: TANKS[tank.kind],
      body: addTank(world, tank.kind, tank, group, tanks.length),
      shieldBody: null,
      hp: tank.hp,
      shield: 0,
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
    });
  }
  const r: Round = {
    world,
    tanks,
    projectiles: [],
    nextProjectileId: 1,
    walls: [],
    mines: input.mines.map((mine, index) => ({
      ...mine,
      detonated: false,
      body: addMine(world, mine.x, mine.y, index),
    })),
    pickups: input.pickups.map((pickup, index) => ({
      ...pickup,
      taken: false,
      body: addPickup(world, pickup.x, pickup.y, index),
    })),
    groups,
    spread: options.spread,
    pendingMines: [],
    events: [],
    allEvents: [],
  };
  applyPlans(r, input);
  return r;
}

function spawnProjectile(
  r: Round,
  kind: ProjectileKind,
  owner: SimTank | null,
  team: string | null,
  start: { x: number; y: number },
  vx: number,
  vy: number,
  mult: number,
  age: number,
): Projectile {
  const projectile: Projectile = {
    id: r.nextProjectileId++,
    kind,
    owner,
    team,
    body: addShot(r.world, start, vx, vy, groupOf(r, team)),
    age,
    mult,
    alive: true,
  };
  r.projectiles.push(projectile);
  return projectile;
}

function fireShots(
  r: Round,
  input: RoundInput,
  tank: SimTank,
  plan: TankArenaPlan,
  kind: ProjectileKind,
  offsets: readonly number[],
): void {
  const base =
    plan.angle + (r.spread ? spreadFor(input, tank.role, tank.kind) : 0);
  const mult = tank.overcharge ? OVERCHARGE_FACTOR : 1;
  tank.overcharge = false;
  const speed = plan.power * tank.spec.maxShotSpeed;
  for (const offset of offsets) {
    const angle = base + offset;
    const projectile = spawnProjectile(
      r,
      kind,
      tank,
      tank.team,
      muzzlePoint(tank.kind, tank.body.x, tank.body.y, angle),
      dcos(angle) * speed,
      dsin(angle) * speed,
      mult,
      0,
    );
    r.events.push({
      type: "fire",
      role: tank.role,
      id: projectile.id,
      kind,
      x: projectile.body.x,
      y: projectile.body.y,
    });
  }
}

function plantWall(r: Round, tank: SimTank, angle: number): void {
  const segment = wallSegment(tank.body.x, tank.body.y, angle);
  const body = addWall(
    r.world,
    segment.x,
    segment.y,
    segment.shape,
    tank.group,
    r.walls.length,
  );
  r.walls.push({
    owner: tank,
    x0: body.x + segment.shape.x0,
    y0: body.y + segment.shape.y0,
    x1: body.x + segment.shape.x1,
    y1: body.y + segment.shape.y1,
    nx: segment.nx,
    ny: segment.ny,
  });
  r.events.push({ type: "wall", role: tank.role });
}

function applyPlans(r: Round, input: RoundInput): void {
  r.tanks.forEach((tank, index) => {
    const plan = input.plans[tank.role];
    if (!plan) return;
    tank.angle = plan.angle;
    const spec = tank.spec;
    switch (plan.action) {
      case "forfeit":
        tank.forfeiting = true;
        break;
      case "missile":
        fireShots(r, input, tank, plan, "missile", [0]);
        break;
      case "jump":
        launchTank(
          r.world,
          tank.body,
          plan.angle,
          jumpSpeed(tank.kind, plan.power, false),
          false,
        );
        r.events.push({ type: "jump", role: tank.role });
        break;
      case "shield":
        tank.shield = spec.shieldCapacity;
        tank.shieldBody = addShield(
          r.world,
          tank.body,
          tank.kind,
          tank.group,
          index,
        );
        r.events.push({ type: "shield", role: tank.role });
        break;
      case "specialA":
        tank.cooldownA = spec.specialA.cooldown + 1;
        if (tank.kind === "bastion")
          fireShots(r, input, tank, plan, "shell", [
            -MORTAR_FAN_DEG,
            0,
            MORTAR_FAN_DEG,
          ]);
        else fireShots(r, input, tank, plan, "rocket", [0]);
        break;
      case "specialB":
        tank.cooldownB = spec.specialB.cooldown + 1;
        if (tank.kind === "bastion") plantWall(r, tank, plan.angle);
        else {
          launchTank(
            r.world,
            tank.body,
            plan.angle,
            jumpSpeed(tank.kind, plan.power, true),
            true,
          );
          tank.leaping = true;
          r.events.push({ type: "leap", role: tank.role });
        }
        break;
      case "idle":
        break;
    }
  });
}

function applyDamage(
  r: Round,
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
    r.events.push({ type: "absorb", role: tank.role, amount: absorbed });
    if (tank.shield <= 0 && tank.shieldBody) {
      r.world.destroyBody(tank.shieldBody);
      tank.shieldBody = null;
    }
  }
  if (rest <= 0) return;
  tank.hp -= rest;
  r.events.push({ type: "damage", role: tank.role, amount: rest, source });
}

function explode(
  r: Round,
  rawX: number,
  y: number,
  cause: BlastKind,
  owner: SimTank | null,
  team: string | null,
  mult: number,
  toucher: SimTank | null,
): void {
  const spec = BLASTS[cause];
  const x = r.world.wrapPosition(rawX);
  r.events.push({
    type: "explode",
    x,
    y,
    radius: spec.radius,
    cause,
    owner: owner?.role ?? null,
  });
  const enemiesOnly = cause === "shockwave";
  for (const tank of r.tanks) {
    if (!tank.present || tank.leaping) continue;
    const self = tank === owner;
    if (self && enemiesOnly) continue;
    if (!self && team !== null && tank.team === team) continue;
    const body = tank.body;
    const falloff =
      tank === toucher
        ? 1
        : blastFalloff(r.world, x, y, spec.radius, body, tank.kind);
    if (falloff <= 0) continue;
    let raw = spec.damage * falloff * mult * (1 - tank.spec.armor);
    if (self) raw *= SELF_DAMAGE_FACTOR;
    if (tank.platingRounds > 0) raw *= PLATING_FACTOR;
    const shielded = tank.shield > 0;
    applyDamage(r, tank, Math.round(raw), owner?.role ?? null);
    const impulse = spec.knockback * falloff * (shielded ? 0.5 : 1);
    const dx = r.world.delta(x, body.x);
    const dy = body.y - y;
    const length = Math.sqrt(dx * dx + dy * dy);
    r.world.applyImpulse(
      body,
      length < 1e-6 ? 0 : (impulse * dx) / length,
      length < 1e-6 ? impulse : (impulse * dy) / length,
    );
  }
  for (const mine of r.mines) {
    if (mine.detonated) continue;
    const dx = r.world.delta(x, mine.x);
    const dy = mine.y - y;
    if (dx * dx + dy * dy <= MINE_TRIGGER_DISTANCE * MINE_TRIGGER_DISTANCE)
      r.pendingMines.push({ mine, owner, team, toucher: null });
  }
}

function drainMines(r: Round): void {
  while (r.pendingMines.length > 0) {
    const next = r.pendingMines.shift();
    if (!next || next.mine.detonated) continue;
    next.mine.detonated = true;
    r.world.destroyBody(next.mine.body);
    r.events.push({
      type: "mine",
      id: next.mine.id,
      x: next.mine.x,
      y: next.mine.y,
    });
    explode(
      r,
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
  r: Round,
  x: number,
  y: number,
  cause: BlastKind,
  owner: SimTank | null,
  team: string | null,
  mult: number,
): void {
  explode(r, x, y, cause, owner, team, mult, null);
  drainMines(r);
}

function collectPickup(r: Round, tank: SimTank, pickup: SimPickup): void {
  pickup.taken = true;
  r.world.destroyBody(pickup.body);
  r.events.push({
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

function awardPickups(r: Round, touches: Map<SimPickup, SimTank[]>): void {
  for (const pickup of r.pickups) {
    if (pickup.taken) continue;
    let winner: SimTank | null = null;
    let winnerDistance = 0;
    for (const tank of touches.get(pickup) ?? []) {
      if (tank.hp <= 0 || !tank.present) continue;
      const dx = r.world.delta(pickup.x, tank.body.x);
      const dy = tank.body.y - pickup.y;
      const distance = dx * dx + dy * dy;
      if (
        winner === null ||
        distance < winnerDistance ||
        (distance === winnerDistance &&
          r.tanks.indexOf(tank) < r.tanks.indexOf(winner))
      ) {
        winner = tank;
        winnerDistance = distance;
      }
    }
    if (winner) collectPickup(r, winner, pickup);
  }
}

function splitRocket(r: Round, p: Projectile): void {
  r.events.push({ type: "split", id: p.id, x: p.body.x, y: p.body.y });
  for (const offset of CLUSTER_OFFSETS)
    spawnProjectile(
      r,
      "bomblet",
      p.owner,
      p.team,
      p.body,
      p.body.vx + offset,
      p.body.vy,
      p.mult,
      p.age,
    );
}

function reflect(r: Round, p: Projectile, wall: Wall): void {
  const body = p.body;
  const dot = body.vx * wall.nx + body.vy * wall.ny;
  body.vx = (body.vx - 2 * dot * wall.nx) * WALL_SPEED_KEEP;
  body.vy = (body.vy - 2 * dot * wall.ny) * WALL_SPEED_KEEP;
  p.owner = wall.owner;
  p.team = wall.owner.team;
  body.group = wall.owner.group;
  r.events.push({
    type: "reflect",
    role: wall.owner.role,
    id: p.id,
    x: body.x,
    y: body.y,
  });
}

function settleProjectile(
  r: Round,
  p: Projectile,
  hit: Extract<ArenaEvent, { type: "hit" }> | undefined,
): void {
  p.age += 1;
  const fate = shotFate(p.body, hit !== undefined, p.age, p.kind === "rocket");
  const struck = hit?.other?.data;
  if (fate === "flying") return;
  if (fate === "hit" && struck?.type === "wall") {
    const wall = r.walls[struck.index];
    if (wall) {
      reflect(r, p, wall);
      return;
    }
  }
  p.alive = false;
  r.world.destroyBody(p.body);
  if (fate === "sunk") return;
  if (fate === "apex") {
    splitRocket(r, p);
    return;
  }
  const at = fate === "hit" ? blastPoint(p.body) : p.body;
  blast(r, at.x, at.y, p.kind, p.owner, p.team, p.mult);
}

export function stepRound(r: Round): void {
  const projectiles = r.projectiles;
  const events = r.world.step();
  const touchedMines: [SimTank, SimMine][] = [];
  const touches = new Map<SimPickup, SimTank[]>();
  const landings: SimTank[] = [];
  const hits = new Map<ArenaBody, Extract<ArenaEvent, { type: "hit" }>>();
  for (const event of events) {
    const data = event.body.data;
    if (event.type === "hit") {
      hits.set(event.body, event);
      continue;
    }
    if (data.type === "shot") {
      const p = projectiles.find((item) => item.body === event.body);
      if (p && event.type === "wrap")
        r.events.push({
          type: "wrap",
          entity: "projectile",
          id: p.id,
          fromX: event.fromX,
          toX: event.toX,
        });
      continue;
    }
    if (data.type !== "tank") continue;
    const tank = r.tanks[data.index];
    if (!tank) continue;
    switch (event.type) {
      case "wrap":
        r.events.push({
          type: "wrap",
          entity: "tank",
          id: tank.role,
          fromX: event.fromX,
          toX: event.toX,
        });
        break;
      case "fall":
        tank.present = false;
        tank.fell = true;
        tank.leaping = false;
        r.events.push({ type: "splash", role: tank.role, x: tank.body.x });
        break;
      case "land":
        r.events.push({ type: "land", role: tank.role });
        if (tank.leaping) {
          tank.leaping = false;
          setUntouchable(tank.body, false);
          landings.push(tank);
        }
        break;
      case "sensor": {
        const sensor = event.sensor.data;
        if (sensor.type === "mine") {
          const mine = r.mines[sensor.index];
          if (mine) touchedMines.push([tank, mine]);
        } else if (sensor.type === "pickup") {
          const pickup = r.pickups[sensor.index];
          if (pickup)
            touches.set(pickup, [...(touches.get(pickup) ?? []), tank]);
        }
        break;
      }
    }
  }
  for (const [tank, mine] of touchedMines) {
    if (mine.detonated || !tank.present) continue;
    r.pendingMines.push({ mine, owner: null, team: null, toucher: tank });
    drainMines(r);
  }
  for (const tank of landings)
    if (tank.present)
      blast(r, tank.body.x, tank.body.y, "shockwave", tank, tank.team, 1);
  awardPickups(r, touches);
  r.projectiles = [];
  for (const p of projectiles)
    if (p.alive) settleProjectile(r, p, hits.get(p.body));
  r.projectiles = projectiles.filter((p) => p.alive).concat(r.projectiles);
}

function snapshotFrame(r: Round, step: number, phase: SimPhase): Frame {
  return {
    step,
    phase,
    tanks: r.tanks.map((tank) => ({
      role: tank.role,
      x: tank.body.x,
      y: tank.body.y,
      vx: tank.body.vx,
      vy: tank.body.vy,
      hp: tank.hp,
      shield: tank.shield,
      airborne: !tank.body.supported,
      alive: tank.present,
      fell: tank.fell,
      ...(tank.angle === null ? {} : { angle: tank.angle }),
    })),
    projectiles: r.projectiles.map((p) => ({
      id: p.id,
      kind: p.kind,
      owner: p.owner?.role ?? null,
      x: p.body.x,
      y: p.body.y,
      vx: p.body.vx,
      vy: p.body.vy,
    })),
    walls: r.walls.map((wall) => ({
      role: wall.owner.role,
      x0: wall.x0,
      y0: wall.y0,
      x1: wall.x1,
      y1: wall.y1,
    })),
    mines: r.mines
      .filter((mine) => !mine.detonated)
      .map((mine) => ({ id: mine.id, x: mine.x, y: mine.y })),
    pickups: r.pickups
      .filter((pickup) => !pickup.taken)
      .map((pickup) => ({
        id: pickup.id,
        kind: pickup.kind,
        x: pickup.x,
        y: pickup.y,
      })),
    events: r.events,
  };
}

function runPhase(
  r: Round,
  phase: SimPhase,
  maxSteps: number,
  startStep: number,
  onFrame: ((frame: Frame) => void) | undefined,
): number {
  let steps = 0;
  do {
    stepRound(r);
    if (onFrame) onFrame(snapshotFrame(r, startStep + steps, phase));
    for (const event of r.events) r.allEvents.push(event);
    r.events = [];
    steps += 1;
  } while (steps < maxSteps && !r.world.settled());
  for (const p of r.projectiles) r.world.destroyBody(p.body);
  r.projectiles = [];
  return steps;
}

function spawnAirstrike(r: Round, airstrike: TankArenaAirstrike): void {
  for (const column of airstrike.columns) {
    spawnProjectile(
      r,
      "bomb",
      null,
      null,
      { x: column, y: BOMB_SPAWN_Y },
      0,
      BOMB_SPAWN_VY,
      1,
      0,
    );
    r.events.push({ type: "airstrike", x: column });
  }
}

function selfDestruct(r: Round): boolean {
  const doomed = r.tanks.filter(
    (tank) => tank.present && tank.hp <= 0 && !tank.forfeiting,
  );
  if (doomed.length === 0) return false;
  for (const tank of doomed) {
    tank.present = false;
    tank.selfDestructed = true;
    r.world.destroyBody(tank.body);
    r.events.push({ type: "selfDestruct", role: tank.role });
  }
  for (const tank of doomed)
    blast(r, tank.body.x, tank.body.y, "selfDestruct", tank, tank.team, 1);
  return true;
}

export function simulateRound(
  input: RoundInput,
  onFrame?: (frame: Frame) => void,
): RoundResult {
  const r = startRound(input, { spread: true });
  let steps = runPhase(r, "action", ACTION_MAX_STEPS, 0, onFrame);
  if (input.airstrike && input.airstrike.round === input.round) {
    spawnAirstrike(r, input.airstrike);
    steps += runPhase(r, "airstrike", AIRSTRIKE_MAX_STEPS, steps, onFrame);
  }
  if (selfDestruct(r))
    steps += runPhase(
      r,
      "selfDestruct",
      SELF_DESTRUCT_MAX_STEPS,
      steps,
      onFrame,
    );
  return {
    steps,
    tanks: r.tanks.map((tank) => ({
      role: tank.role,
      x: tank.body.x,
      y: tank.body.y,
      vx: tank.body.vx,
      vy: tank.body.vy,
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
    pickups: r.pickups
      .filter((pickup) => !pickup.taken)
      .map(({ taken: _taken, body: _body, ...pickup }) => pickup),
    mines: r.mines
      .filter((mine) => !mine.detonated)
      .map(({ detonated: _detonated, body: _body, ...mine }) => mine),
    events: r.allEvents,
  };
}
