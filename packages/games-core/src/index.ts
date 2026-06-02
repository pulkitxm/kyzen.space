export { GAME_CATEGORIES, type GameCategoryDef } from "./categories";

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

export { GAMES } from "./games";
export { ticTacToeDefinition } from "./games/tic-tac-toe";
export {
  emptyBoard,
  isBoardFull,
  isTerminal,
  lineWinner,
  ticTacToeEngine,
  WIN_LINES,
} from "./games/tic-tac-toe/engine";
export {
  type Cell,
  type Mark,
  TIC_TAC_TOE,
  type TicTacToeConfig,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeConfigSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "./games/tic-tac-toe/schemas";
export {
  getCategoryGroups,
  getDefinition,
  getEngine,
  hasEngine,
  listDefinitions,
  listGameMeta,
  listGameTypes,
} from "./registry";
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
} from "./schemas";
