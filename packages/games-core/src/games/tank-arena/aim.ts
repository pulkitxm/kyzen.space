import type { TankAction, TankArenaState } from "@kyzen/shared/types";
import {
  LEAP_SPEED_FACTOR,
  TANKS,
  WALL_DISTANCE,
  WALL_LENGTH,
  WATER_Y,
} from "./constants";
import { arenaWidth, seatIndex } from "./helpers";
import { dcos, dsin, wrapX } from "./math";
import {
  type BodyState,
  muzzleDistance,
  stepBody,
  traceProjectile,
} from "./simulate";

export type AimPoint = { x: number; y: number };

export type TrajectoryPreview = {
  points: AimPoint[];
  visibleFraction: number;
};

const JUMP_PREVIEW_STEPS = 360;

export function aimVector(angleDeg: number): AimPoint {
  return { x: dcos(angleDeg), y: dsin(angleDeg) };
}

export function previewTrajectory(
  state: TankArenaState,
  role: string,
  action: TankAction,
  angle: number,
  power: number,
): TrajectoryPreview {
  const tank = state.tanks[seatIndex(state, role)];
  if (!tank?.alive || !tank.kind) return { points: [], visibleFraction: 0 };
  const spec = TANKS[tank.kind];
  const width = arenaWidth(state);
  const c = dcos(angle);
  const s = dsin(angle);
  if (action === "missile" || action === "specialA") {
    const distance = muzzleDistance(tank.kind);
    const speed = power * spec.maxShotSpeed;
    const start = {
      x: wrapX(tank.x + c * distance, width),
      y: tank.y + s * distance,
    };
    const points: AimPoint[] = [start];
    traceProjectile(width, start.x, start.y, c * speed, s * speed, [], {
      points,
    });
    return { points, visibleFraction: spec.guideFraction };
  }
  if (action === "specialB" && tank.kind === "bastion") {
    const cx = tank.x + c * WALL_DISTANCE;
    const cy = tank.y + s * WALL_DISTANCE;
    const half = WALL_LENGTH / 2;
    return {
      points: [
        { x: wrapX(cx + s * half, width), y: cy - c * half },
        { x: wrapX(cx - s * half, width), y: cy + c * half },
      ],
      visibleFraction: 1,
    };
  }
  if (action === "jump" || action === "specialB") {
    const speed =
      power *
      spec.maxJumpSpeed *
      (action === "specialB" ? LEAP_SPEED_FACTOR : 1);
    const body: BodyState = {
      x: tank.x,
      y: tank.y,
      vx: c * speed,
      vy: s * speed,
      hw: spec.halfWidth,
      hh: spec.halfHeight,
      supported: false,
    };
    const points: AimPoint[] = [{ x: tank.x, y: tank.y }];
    for (let i = 0; i < JUMP_PREVIEW_STEPS; i++) {
      stepBody(body, width);
      points.push({ x: body.x, y: body.y });
      if ((body.supported && body.vx === 0) || body.y < WATER_Y) break;
    }
    return { points, visibleFraction: 1 };
  }
  return { points: [], visibleFraction: 0 };
}
