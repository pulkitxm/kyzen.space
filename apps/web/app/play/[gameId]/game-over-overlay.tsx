"use client";

import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { GameJson, SeriesDetail } from "@gamelobby/shared/types";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { Button } from "@/components/ui";
import { clientFetchJson } from "@/lib/api-client";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";

function isOver(status: string): boolean {
  return status === "completed" || status === "abandoned";
}

function outcomeLabel(game: GameJson, userId: string): string {
  if (game.status === "abandoned") return "Game abandoned";
  if (game.winner === "draw") return "It's a draw";
  if (!game.winner) return "Game over";
  return game.winner === userId ? "You won! 🎉" : "You lost";
}

export function GameOverOverlay({
  gameId,
  userId,
  initialGame,
}: {
  gameId: string;
  userId: string;
  initialGame: GameJson;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const { openLayer } = useLayeredPopup();
  const [game, setGame] = useState<GameJson>(initialGame);
  const [open, setOpen] = useState(isOver(initialGame.status));
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [rematchCode, setRematchCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSocketEvent<{ game: GameJson }>("game_state", (payload) => {
    setGame(payload.game);
    if (isOver(payload.game.status)) setOpen(true);
  });
  useSocketEvent<{ newGameId: string }>(
    CHAT_EVENTS.rematchCreated,
    (payload) => {
      setRematchCode(payload.newGameId);
    },
  );

  useEffect(() => {
    if (!open || !isOver(game.status)) return;
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, gameId, game.status]);

  const isPlayer = game.players.some((p) => p.userId === userId);
  const canRematch =
    isPlayer && game.status === "completed" && !!game.conversationId;
  const showSeries = (detail?.score.totalGames ?? 0) >= 2;

  const onRematch = useCallback(async () => {
    if (rematchCode) {
      router.push(`/play/${rematchCode}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await emitAck<{ gameId: string }>(
        socket,
        CHAT_EVENTS.rematch,
        { gameId },
      );
      router.push(`/play/${res.gameId}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Couldn't start the rematch");
    }
  }, [socket, gameId, rematchCode, router]);

  if (!open || !isOver(game.status)) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
      >
        <motion.div
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-4 text-center font-bold text-xl">
            {outcomeLabel(game, userId)}
          </h2>
          {showSeries && detail ? (
            <div className="mb-4">
              <SeriesScoreboard score={detail.score} />
            </div>
          ) : null}
          {error ? (
            <p className="mb-2 text-center text-danger text-sm">{error}</p>
          ) : null}
          <div className="flex flex-col gap-2">
            {canRematch ? (
              <Button onClick={onRematch} disabled={busy}>
                {rematchCode ? "Go to rematch" : "Rematch"}
              </Button>
            ) : null}
            {showSeries ? (
              <Button
                variant="secondary"
                onClick={() =>
                  openLayer({
                    title: "Series",
                    content: <SeriesDetailModal gameId={gameId} />,
                    size: "md",
                  })
                }
              >
                View series
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
