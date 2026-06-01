/** Props every game client component receives from the `/play` route. */
export type GameClientProps = {
  gameId: string;
  userId: string | null;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: { userId: string; username: string; role: string }[];
    // Optional: a never-started game may have no state yet (matches GameJson).
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
};
