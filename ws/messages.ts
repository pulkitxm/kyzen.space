export type ClientJoinRoom = {
  gameId: string;
};

export type ClientMakeMove = {
  gameId: string;
  moveData: TicTacToeMoveData;
};

export type TicTacToeMoveData = {
  row: number;
  col: number;
};

export type ServerGameStatePayload = {
  game: Record<string, unknown>;
  moves: Record<string, unknown>[];
};

export type ServerMoveMadePayload = {
  move: Record<string, unknown>;
  gameState: unknown;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};
