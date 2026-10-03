import {
  type GameDefinition,
  type TankArenaMove,
  type TankArenaState,
  tankArenaConfigSchema,
  tankArenaMoveSchema,
  tankArenaStateSchema,
} from "@kyzen/shared/types";
import { tankArenaEngine } from "./engine";
import { tankArenaMeta } from "./meta";

export const tankArenaDefinition: GameDefinition<
  TankArenaState,
  TankArenaMove
> = {
  meta: tankArenaMeta,
  engine: tankArenaEngine,
  stateSchema: tankArenaStateSchema,
  moveSchema: tankArenaMoveSchema,
  configSchema: tankArenaConfigSchema,
  configFields: [],
  queues: [
    {
      id: "duel",
      label: "1v1",
      description: "Two tanks, one survivor.",
      config: { mode: "ffa" },
    },
    {
      id: "teams",
      label: "2v2",
      description: "Two teams of two tanks.",
      config: { mode: "teams" },
    },
  ],
  layout: "wide",
};

export type {
  AimPoint,
  TrajectoryPreview,
} from "./aim";
export { aimAngle, aimVector, previewTrajectory } from "./aim";
export type { Anchor, Arena, Box, SpawnSlot } from "./arena";
export { buildArena, modulesFor } from "./arena";
export { botMove } from "./bots";
export * from "./constants";
export {
  airstrikeFor,
  isStrikeRound,
  replayMs,
  resolutionInput,
  roundInputOf,
  tankArenaEngine,
} from "./engine";
export {
  aliveTeams,
  arenaWidth,
  canUse,
  cooldownsOf,
  isJumpAction,
  roleTeam,
} from "./helpers";
export { tankArenaMeta } from "./meta";
export type {
  Frame,
  FrameProjectile,
  FrameTank,
  FrameWall,
  ProjectileKind,
  RoundInput,
  RoundResult,
  RoundSeat,
  RoundTank,
  SimEvent,
  SimPhase,
} from "./simulate";
export { simulateRound } from "./simulate";
export { shieldRadius } from "./world";
