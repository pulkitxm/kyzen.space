// Engine abstraction

// Catalog categories
export { GAME_CATEGORIES, type GameCategoryDef } from "./categories";

// Game definition (the self-describing unit of "a game")
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

// The single games array + registry derived from it
export { GAMES } from "./games";
export { ticTacToeDefinition } from "./games/tic-tac-toe";
// Tic-tac-toe (engine helpers, schemas, types, definition)
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
// Shared wire DTOs + socket payload schemas (types derived via z.infer)
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
