"use client";

import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type {
  ConversationJson,
  GameJson,
  SeriesDetail,
} from "@gamelobby/shared/types";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { Button, Character } from "@/components/ui";
import { clientFetchJson } from "@/lib/api-client";
import { conversationHref } from "@/lib/chat/conversation-href";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

function isOver(status: string): boolean {
  return status === "completed" || status === "abandoned";
}

function outcomeLabel(game: GameJson, userId: string): string {
  if (game.status === "abandoned") return "Game abandoned";
  if (game.winner === "draw") return "It's a draw";
  if (!game.winner) return "Game over";
  return game.winner === userId ? "You won! 🎉" : "You lost";
}

function PlayersRow({ game }: { game: GameJson }) {
  return (
    <div className="flex items-start justify-center gap-8">
      {game.players.map((p) => {
        const won = game.winner === p.userId;
        return (
          <div key={p.userId} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "rounded-full",
                won &&
                  "ring-2 ring-amber-500 ring-offset-2 ring-offset-surface-raised",
              )}
            >
              <Character
                config={p.avatar ?? null}
                fallbackSeed={p.username}
                size={56}
                className="rounded-full border-2 border-card bg-surface-overlay"
              />
            </div>
            <span className="max-w-24 truncate text-sm">{p.username}</span>
            {won ? (
              <FaTrophy
                className="text-amber-500"
                size={14}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GameOverOverlay({
  gameId,
  userId,
  initialGame,
  conversation,
}: {
  gameId: string;
  userId: string;
  initialGame: GameJson;
  conversation: ConversationJson | null;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const { openLayer, layers } = useLayeredPopup();
  const cardRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameJson>(initialGame);
  const [open, setOpen] = useState(() => isOver(initialGame.status));
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

  const layerCount = layers.length;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (layerCount > 0) return;
      const card = cardRef.current;
      if (card && !card.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, layerCount]);

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

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <AnimatePresence>
        {open && isOver(game.status) ? (
          <motion.div
            ref={cardRef}
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-6"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.18 }}
          >
            <h2 className="mb-4 text-center font-bold text-xl">
              {outcomeLabel(game, userId)}
            </h2>
            <div className="mb-4">
              {showSeries && detail ? (
                <SeriesScoreboard score={detail.score} />
              ) : (
                <PlayersRow game={game} />
              )}
            </div>
            {error ? (
              <p className="mb-2 text-center text-danger text-sm">{error}</p>
            ) : null}
            <div className="flex flex-col gap-2">
              {canRematch ? (
                <Button onClick={onRematch} disabled={busy}>
                  {rematchCode ? "Go to rematch" : "Rematch"}
                </Button>
              ) : null}
              {conversation ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    router.push(conversationHref(conversation, userId))
                  }
                >
                  Chat
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
        ) : null}
      </AnimatePresence>
    </div>
  );
}
