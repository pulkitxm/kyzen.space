"use client";

import type { GameJson, MoveJson } from "@kyzen/shared/types";
import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { bindGameSession, mergeGameMoves, mergeGameSnapshot } from "./session";

export function useGameSession({
  socket,
  userId,
  initialGame,
  initialMoves,
}: {
  socket: Socket | null;
  userId: string | null;
  initialGame: GameJson;
  initialMoves: MoveJson[];
}) {
  const [session, setSession] = useState(() => ({
    game: initialGame,
    moves: initialMoves,
  }));
  const [error, setError] = useState<string | null>(null);
  const enabled = Boolean(userId);
  const gameId = initialGame.id;

  useEffect(() => {
    if (!socket || !enabled) return;
    return bindGameSession(
      socket,
      gameId,
      (payload) => {
        setError(null);
        setSession((previous) => ({
          game: mergeGameSnapshot(previous.game, payload.game),
          moves: mergeGameMoves(previous.moves, payload),
        }));
      },
      setError,
    );
  }, [socket, gameId, enabled]);

  const makeMove = useCallback(
    (moveData: unknown) => {
      if (!socket?.connected || session.game.status !== "active") return;
      const playerId = session.game.viewerId ?? userId;
      if (!session.game.players.some((player) => player.userId === playerId))
        return;
      setError(null);
      socket.emit("make_move", { gameId, moveData });
    },
    [socket, gameId, userId, session.game],
  );

  return { ...session, error, makeMove };
}
