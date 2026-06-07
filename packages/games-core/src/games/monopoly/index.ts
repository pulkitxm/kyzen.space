import {
  type GameDefinition,
  type MonopolyConfig,
  type MonopolyMove,
  type MonopolyState,
  monopolyConfigSchema,
  monopolyMoveSchema,
  monopolyStateSchema,
} from "@gamelobby/shared/types";
import { monopolyEngine } from "./engine";
import { monopolyMeta } from "./meta";

export const monopolyDefinition: GameDefinition<
  MonopolyState,
  MonopolyMove,
  MonopolyConfig
> = {
  meta: monopolyMeta,
  engine: monopolyEngine,
  stateSchema: monopolyStateSchema,
  moveSchema: monopolyMoveSchema,
  configSchema: monopolyConfigSchema,
  configFields: [],
};
export {
  BOARD,
  BOARD_SIZE,
  GO_SALARY,
  JAIL_FINE,
  JAIL_POSITION,
  MAX_JAIL_TURNS,
  TILE_BY_ID,
  TILE_BY_POSITION,
} from "./constants/board";
export { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from "./constants/cards";
export { applyAction, monopolyEngine } from "./engine";
export { monopolyMeta } from "./meta";
