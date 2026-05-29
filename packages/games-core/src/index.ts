export type {
  GameEngine,
  Outcome,
  Seat,
  ReduceResult,
  StepResult,
  MoveContext,
} from "./engine";

export {
  getEngine,
  hasEngine,
  listGameTypes,
} from "./registry";

export type {
  ClientJoinRoom,
  ClientMakeMove,
  GameJson,
  MoveJson,
  ServerGameStatePayload,
  ServerMoveMadePayload,
  ServerGameOverPayload,
  ServerErrorPayload,
  MatchDescriptor,
} from "./messages";

export {
  ticTacToeEngine,
  TIC_TAC_TOE,
  emptyBoard,
  lineWinner,
  isBoardFull,
  isTerminal,
  WIN_LINES,
} from "./games/tic-tac-toe";

export type {
  Cell,
  Mark,
  TicTacToeState,
  TicTacToeMove,
} from "./games/tic-tac-toe";
