import {
  type CarFootballConfig,
  type CarFootballMove,
  type CarFootballState,
  carFootballConfigSchema,
  carFootballMoveSchema,
  carFootballStateSchema,
  type GameDefinition,
} from "@kyzen/shared/types";
import { carFootballEngine } from "./engine";
import { carFootballMeta } from "./meta";

export const carFootballDefinition: GameDefinition<
  CarFootballState,
  CarFootballMove,
  CarFootballConfig
> = {
  meta: carFootballMeta,
  engine: carFootballEngine,
  stateSchema: carFootballStateSchema,
  moveSchema: carFootballMoveSchema,
  configSchema: carFootballConfigSchema,
  configFields: [],
};
