import {
  type Body,
  boxDistance,
  dcos,
  dsin,
  type PhysicsEvent,
  type SegmentShape,
  World,
} from "@kyzen/physics";
import type { TankKind } from "@kyzen/shared/types";
import { terrainFor } from "./arena";
import {
  GRAVITY,
  GROUND_FRICTION,
  LEAP_SPEED_FACTOR,
  MIN_FALLOFF,
  MINE_RADIUS,
  PICKUP_RADIUS,
  PROJECTILE_LIFETIME_STEPS,
  REST_SPEED,
  REST_STEPS,
  RESTITUTION,
  SHIELD_MARGIN,
  STEP,
  TANKS,
  WALL_DISTANCE,
  WALL_LENGTH,
  WATER_Y,
} from "./constants";

const LAYER = {
  tank: 1,
  ghost: 2,
  shield: 4,
  wall: 8,
  mine: 16,
  pickup: 32,
  shot: 64,
} as const;
const SHOT_MASK = LAYER.tank | LAYER.shield | LAYER.wall | LAYER.mine;
const TANK_MASK = LAYER.shot | LAYER.mine | LAYER.pickup;
const BLAST_NUDGE = 0.02;
const LOS_INSET = 0.01;

type Entity =
  | {
      type: "tank" | "shield" | "wall" | "mine" | "pickup" | "target";
      index: number;
    }
  | { type: "shot" };

export type ArenaBody = Body<Entity>;
export type ArenaWorld = World<Entity>;
export type ArenaEvent = PhysicsEvent<Entity>;
export type Point = { x: number; y: number };

const SHOT: Entity = { type: "shot" };

export function arenaWorld(modules: number): ArenaWorld {
  return new World<Entity>({
    terrain: terrainFor(modules),
    gravity: GRAVITY,
    dt: STEP,
    killY: WATER_Y,
    restSpeed: REST_SPEED,
    restSteps: REST_STEPS,
  });
}

export function shieldRadius(kind: TankKind): number {
  return TANKS[kind].halfWidth + SHIELD_MARGIN;
}

function muzzleDistance(kind: TankKind): number {
  const spec = TANKS[kind];
  return (
    Math.sqrt(
      spec.halfWidth * spec.halfWidth + spec.halfHeight * spec.halfHeight,
    ) + 0.2
  );
}

export function jumpSpeed(kind: TankKind, power: number, leap: boolean) {
  return power * TANKS[kind].maxJumpSpeed * (leap ? LEAP_SPEED_FACTOR : 1);
}

export function addTank(
  world: ArenaWorld,
  kind: TankKind,
  state: { x: number; y: number; vx: number; vy: number },
  group: number,
  index: number,
): ArenaBody {
  const spec = TANKS[kind];
  return world.createBody({
    kind: "dynamic",
    shape: {
      type: "box",
      halfWidth: spec.halfWidth,
      halfHeight: spec.halfHeight,
    },
    x: state.x,
    y: state.y,
    vx: state.vx,
    vy: state.vy,
    mass: spec.mass,
    friction: GROUND_FRICTION,
    restitution: RESTITUTION,
    layer: LAYER.tank,
    mask: TANK_MASK,
    group,
    data: { type: "tank", index },
  });
}

export function launchTank(
  world: ArenaWorld,
  body: ArenaBody,
  angle: number,
  speed: number,
  leap: boolean,
): void {
  world.launch(body, dcos(angle) * speed, dsin(angle) * speed);
  setUntouchable(body, leap);
}

export function setUntouchable(body: ArenaBody, untouchable: boolean): void {
  body.layer = untouchable ? LAYER.ghost : LAYER.tank;
}

export function addShot(
  world: ArenaWorld,
  start: Point,
  vx: number,
  vy: number,
  group: number,
): ArenaBody {
  return world.createBody({
    kind: "bullet",
    x: start.x,
    y: start.y,
    vx,
    vy,
    layer: LAYER.shot,
    mask: SHOT_MASK,
    group,
    data: SHOT,
  });
}

export function muzzlePoint(
  kind: TankKind,
  x: number,
  y: number,
  angle: number,
): Point {
  const distance = muzzleDistance(kind);
  return { x: x + dcos(angle) * distance, y: y + dsin(angle) * distance };
}

export function addShield(
  world: ArenaWorld,
  tank: ArenaBody,
  kind: TankKind,
  group: number,
  index: number,
): ArenaBody {
  return world.createBody({
    kind: "static",
    shape: { type: "circle", radius: shieldRadius(kind) },
    x: tank.x,
    y: tank.y,
    follow: tank,
    layer: LAYER.shield,
    mask: LAYER.shot,
    group,
    data: { type: "shield", index },
  });
}

export function wallSegment(x: number, y: number, angle: number) {
  const c = dcos(angle);
  const s = dsin(angle);
  const half = WALL_LENGTH / 2;
  const shape: SegmentShape = {
    type: "segment",
    x0: s * half,
    y0: -c * half,
    x1: -s * half,
    y1: c * half,
  };
  return {
    x: x + c * WALL_DISTANCE,
    y: y + s * WALL_DISTANCE,
    nx: c,
    ny: s,
    shape,
  };
}

export function addWall(
  world: ArenaWorld,
  x: number,
  y: number,
  shape: SegmentShape,
  group: number,
  index: number,
): ArenaBody {
  return world.createBody({
    kind: "static",
    shape,
    x,
    y,
    layer: LAYER.wall,
    mask: LAYER.shot,
    group,
    data: { type: "wall", index },
  });
}

export function addMine(
  world: ArenaWorld,
  x: number,
  y: number,
  index: number,
): ArenaBody {
  return world.createBody({
    kind: "static",
    shape: { type: "circle", radius: MINE_RADIUS },
    x,
    y,
    sensor: true,
    layer: LAYER.mine,
    mask: LAYER.shot | LAYER.tank,
    data: { type: "mine", index },
  });
}

export function addPickup(
  world: ArenaWorld,
  x: number,
  y: number,
  index: number,
): ArenaBody {
  return world.createBody({
    kind: "static",
    shape: { type: "circle", radius: PICKUP_RADIUS },
    x,
    y,
    sensor: true,
    layer: LAYER.pickup,
    mask: LAYER.tank | LAYER.ghost,
    data: { type: "pickup", index },
  });
}

export function addTarget(
  world: ArenaWorld,
  kind: TankKind,
  x: number,
  y: number,
  index: number,
): ArenaBody {
  const spec = TANKS[kind];
  return world.createBody({
    kind: "static",
    shape: {
      type: "box",
      halfWidth: spec.halfWidth,
      halfHeight: spec.halfHeight,
    },
    x,
    y,
    layer: LAYER.tank,
    mask: LAYER.shot,
    data: { type: "target", index },
  });
}

export type ShotFate = "hit" | "sunk" | "apex" | "expired" | "flying";

export function shotFate(
  body: ArenaBody,
  hit: boolean,
  age: number,
  splitsAtApex: boolean,
): ShotFate {
  if (hit) return "hit";
  if (body.removed) return "sunk";
  if (splitsAtApex && body.vy <= 0) return "apex";
  if (age >= PROJECTILE_LIFETIME_STEPS) return "expired";
  return "flying";
}

export function blastPoint(body: ArenaBody): Point {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
  const back = speed > 0 ? BLAST_NUDGE / speed : 0;
  return { x: body.x - body.vx * back, y: body.y - body.vy * back };
}

export function blastFalloff(
  world: ArenaWorld,
  x: number,
  y: number,
  radius: number,
  body: { x: number; y: number },
  kind: TankKind,
): number {
  const spec = TANKS[kind];
  const tx = x + world.delta(x, body.x);
  const distance = boxDistance(
    x,
    y,
    tx,
    body.y,
    spec.halfWidth,
    spec.halfHeight,
  );
  if (distance > radius || !lineOfSight(world, x, y, tx, body.y)) return 0;
  return 1 - ((1 - MIN_FALLOFF) * distance) / radius;
}

export type TraceHit = {
  kind: "terrain" | "target" | "water" | "timeout" | "apex";
  target: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steps: number;
};

export function traceShot(
  world: ArenaWorld,
  start: Point,
  vx: number,
  vy: number,
  options: { age?: number; splitsAtApex?: boolean } = {},
): TraceHit {
  const body = addShot(world, start, vx, vy, 0);
  let age = options.age ?? 0;
  try {
    for (let step = 1; ; step++) {
      age += 1;
      let other: Entity | null | undefined;
      for (const event of world.step())
        if (event.type === "hit" && event.body === body)
          other = event.other?.data ?? null;
      const fate = shotFate(
        body,
        other !== undefined,
        age,
        options.splitsAtApex ?? false,
      );
      if (fate === "flying") continue;
      const point = fate === "hit" ? blastPoint(body) : body;
      return {
        kind:
          fate === "hit"
            ? other?.type === "target"
              ? "target"
              : "terrain"
            : fate === "sunk"
              ? "water"
              : fate === "apex"
                ? "apex"
                : "timeout",
        target: other && other.type === "target" ? other.index : -1,
        x: world.wrapPosition(point.x),
        y: point.y,
        vx: body.vx,
        vy: body.vy,
        steps: step,
      };
    }
  } finally {
    world.destroyBody(body);
  }
}

export function lineOfSight(
  world: ArenaWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return world.lineOfSight(x0, y0, x1, y1, LOS_INSET);
}
