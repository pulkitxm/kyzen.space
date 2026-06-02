import type { Socket } from "socket.io-client";

export type GameClientProps = {
  gameId: string;
  userId: string | null;
  socket: Socket | null;
  connected: boolean;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: { userId: string; username: string; role: string }[];
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
};
