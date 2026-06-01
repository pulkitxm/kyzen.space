export type ClientJoinRoom = {
  gameId: string;
  /** "spectate" joins read-only (no seat). Defaults to "play". */
  intent?: "play" | "spectate";
};

export type ClientMakeMove<Move = unknown> = {
  gameId: string;
  moveData: Move;
};

export type GameJson = {
  id: string;
  gameType: string;
  status: "waiting" | "active" | "completed" | "abandoned" | string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  gameState: unknown;
  /** Phase 3 — set when the game was created from a conversation. */
  conversationId?: string | null;
  creatorUserId?: string | null;
  seatingMode?: "open" | "challenge" | null;
  challengedUserId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MoveJson = {
  id: string;
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: unknown;
  createdAt?: string | null;
};

export type ServerGameStatePayload = {
  game: GameJson;
  moves: MoveJson[];
};

export type ServerMoveMadePayload = {
  move: MoveJson;
  gameState: unknown;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};

export type MatchDescriptor = {
  matchId: string;
  serverUrl: string;
  token: string;
};
