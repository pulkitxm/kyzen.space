import {
  type GameDefinition,
  type OldMaidConfig,
  type OldMaidMove,
  type OldMaidState,
  oldMaidConfigSchema,
  oldMaidMoveSchema,
  oldMaidStateSchema,
} from "@gamelobby/shared/types";
import { oldMaidEngine } from "./engine";
import { oldMaidMeta } from "./meta";

export const oldMaidDefinition: GameDefinition<
  OldMaidState,
  OldMaidMove,
  OldMaidConfig
> = {
  meta: oldMaidMeta,
  engine: oldMaidEngine,
  stateSchema: oldMaidStateSchema,
  moveSchema: oldMaidMoveSchema,
  configSchema: oldMaidConfigSchema,
  configFields: [],
};
