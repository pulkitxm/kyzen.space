import type {
  TankAction,
  TankArenaState,
  TankPlanAction,
} from "@kyzen/shared/types";
import {
  ACTION_MAX_STEPS,
  PROJECTILE_LIFETIME_STEPS,
  TANKS,
} from "./constants";
import { arenaWidth, seatIndex } from "./helpers";
import { datan2, dcos, dsin, wrapX } from "./math";
import { type RoundInput, startRound, stepRound } from "./simulate";
import { wallSegment } from "./world";

export type AimPoint = { x: number; y: number };

export type TrajectoryPreview = {
  points: AimPoint[];
  visibleFraction: number;
};

const NONE: TrajectoryPreview = { points: [], visibleFraction: 0 };

export function aimVector(angleDeg: number): AimPoint {
  return { x: dcos(angleDeg), y: dsin(angleDeg) };
}

export function aimAngle(dx: number, dy: number): number {
  return datan2(dy, dx);
}

function previewInput(
  state: TankArenaState,
  role: string,
  action: TankPlanAction,
  angle: number,
  power: number,
): RoundInput {
  return {
    seed: 0,
    round: state.round,
    modules: state.modules,
    seats: state.seats,
    tanks: state.tanks,
    pickups: state.pickups,
    mines: state.mines,
    airstrike: null,
    plans: { [role]: { action, angle, power } },
  };
}

export function previewTrajectory(
  state: TankArenaState,
  role: string,
  action: TankAction,
  angle: number,
  power: number,
): TrajectoryPreview {
  const index = seatIndex(state, role);
  const tank = state.tanks[index];
  if (!tank?.alive || !tank.kind) return NONE;
  const spec = TANKS[tank.kind];
  if (action === "specialB" && tank.kind === "bastion") {
    const wall = wallSegment(tank.x, tank.y, angle);
    const width = arenaWidth(state);
    return {
      points: [
        { x: wrapX(wall.x + wall.shape.x0, width), y: wall.y + wall.shape.y0 },
        { x: wrapX(wall.x + wall.shape.x1, width), y: wall.y + wall.shape.y1 },
      ],
      visibleFraction: 1,
    };
  }
  const shot = action === "missile" || action === "specialA";
  const jump = action === "jump" || action === "specialB";
  if (!shot && !jump) return NONE;
  const round = startRound(previewInput(state, role, action, angle, power), {
    spread: false,
  });
  if (shot) {
    const tracked =
      round.projectiles[
        action === "specialA" && tank.kind === "bastion" ? 1 : 0
      ];
    if (!tracked) return NONE;
    const body = tracked.body;
    const points: AimPoint[] = [{ x: body.x, y: body.y }];
    for (let i = 0; i < PROJECTILE_LIFETIME_STEPS && tracked.alive; i++) {
      stepRound(round);
      points.push({ x: body.x, y: body.y });
    }
    return { points, visibleFraction: spec.guideFraction };
  }
  const mover = round.tanks.find((item) => item.role === role)?.body;
  if (!mover) return NONE;
  const points: AimPoint[] = [{ x: mover.x, y: mover.y }];
  for (let i = 0; i < ACTION_MAX_STEPS; i++) {
    stepRound(round);
    points.push({ x: mover.x, y: mover.y });
    if (mover.removed || (mover.supported && mover.vx === 0)) break;
  }
  return { points, visibleFraction: 1 };
}
