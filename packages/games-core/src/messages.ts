/**
 * Wire contracts shared by the realtime client (apps/web) and server
 * (apps/server). Kept transport-light: payloads are JSON-serializable.
 */

/** Client → server: ask to join/subscribe a game room. */
export type ClientJoinRoom = {
  gameId: string;
};

/** Client → server: submit a move. `moveData` shape is game-specific. */
export type ClientMakeMove<Move = unknown> = {
  gameId: string;
  moveData: Move;
};

/** A serialized game row as broadcast to clients. */
export type GameJson = {
  id: string;
  gameType: string;
  status: "waiting" | "active" | "completed" | "abandoned" | string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  gameState: unknown;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** A serialized move row. */
export type MoveJson = {
  id: string;
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: unknown;
  createdAt?: string | null;
};

/** Server → client: full snapshot of a game + its moves. */
export type ServerGameStatePayload = {
  game: GameJson;
  moves: MoveJson[];
};

/** Server → client: a single move was applied. */
export type ServerMoveMadePayload = {
  move: MoveJson;
  gameState: unknown;
};

/** Server → client: the game ended. */
export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

/** Server → client: an error occurred handling a client event. */
export type ServerErrorPayload = {
  message: string;
};

/** Connection descriptor returned by matchmaking — the match-allocation seam. */
export type MatchDescriptor = {
  matchId: string;
  serverUrl: string;
  token: string;
};
