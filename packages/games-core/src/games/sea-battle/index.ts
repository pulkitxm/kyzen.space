import {
  type GameDefinition,
  type SeaBattleConfig,
  type SeaBattleMove,
  type SeaBattleState,
  seaBattleConfigSchema,
  seaBattleMoveSchema,
  seaBattleStateSchema,
} from "@kyzen/shared/types";
import { seaBattleEngine } from "./engine";
import { seaBattleMeta } from "./meta";

export const seaBattleDefinition: GameDefinition<
  SeaBattleState,
  SeaBattleMove,
  SeaBattleConfig
> = {
  meta: seaBattleMeta,
  engine: seaBattleEngine,
  stateSchema: seaBattleStateSchema,
  moveSchema: seaBattleMoveSchema,
  configSchema: seaBattleConfigSchema,
  configFields: [],
};
