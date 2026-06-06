export type { default as GameCategoryDef } from "./categories";
export { type GameType, gameTypeSchema } from "./core";
export type {
  ConfigField,
  ConfigFieldType,
  GameDefinition,
  GameMeta,
} from "./definition";
export type {
  GameEngine,
  MoveContext,
  Outcome,
  ReduceResult,
  Seat,
  StepResult,
} from "./engine";
export {
  type Cell,
  type Mark,
  type TicTacToeConfig,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeConfigSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "./tic-tac-toe/schemas";
export {
  type ClientJoinRoom,
  type ClientMakeMove,
  clientJoinRoomSchema,
  clientMakeMoveSchema,
  type GameJson,
  type GamePlayerDto,
  type GameStatusDto,
  gameJsonSchema,
  gamePlayerSchema,
  gameStatusSchema,
  type MoveJson,
  moveJsonSchema,
  type SeatingModeDto,
  type ServerErrorPayload,
  type ServerGameOverPayload,
  type ServerGameStatePayload,
  type ServerMoveMadePayload,
  seatingModeSchema,
  uuidSchema,
} from "./wire";
