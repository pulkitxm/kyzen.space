export type GameClientProps = {
  gameId: string;
  userId: string | null;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: { userId: string; username: string; role: string }[];
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
};
