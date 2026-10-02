"use client";

import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  type ConversationJson,
  type GameJson,
  isGameOver,
  type SeriesDetail,
} from "@kyzen/shared/types";
import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { GlassMotionPane } from "@/components/glass/glass-pane";
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
  game,
  conversation,
}: {
  gameId: string;
  userId: string;
  game: GameJson;
  conversation: ConversationJson | null;
}) {
  const { layers } = useLayeredPopup();
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(() => isGameOver(game.status));
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [rematch, setRematch] = useState<{
    busy: boolean;
    error: string | null;
    code: string | null;
  }>({ busy: false, error: null, code: null });

  const [previousStatus, setPreviousStatus] = useState(game.status);
  if (previousStatus !== game.status) {
    setPreviousStatus(game.status);
    if (isGameOver(game.status)) setOpen(true);
  }

  useSocketEvent<{ newGameId: string }>(
    CHAT_EVENTS.rematchCreated,
    (payload) => {
      setRematch((r) => ({ ...r, code: payload.newGameId }));
    },
  );

  useEffect(() => {
    if (!open || !isGameOver(game.status)) return;
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

  const showSeries = (detail?.score.totalGames ?? 0) >= 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {open && isGameOver(game.status) ? (
            <GlassMotionPane
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
              {rematch.error ? (
                <p className="mb-2 text-center text-danger text-sm">
                  {rematch.error}
                </p>
              ) : null}
              <GameOverActions
                gameId={gameId}
                userId={userId}
                game={game}
                conversation={conversation}
                rematch={rematch}
                setRematch={setRematch}
                showSeries={showSeries}
                onClose={() => setOpen(false)}
              />
            </GlassMotionPane>
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}

type RematchState = {
  busy: boolean;
  error: string | null;
  code: string | null;
};

function GameOverActions({
  gameId,
  userId,
  game,
  conversation,
  rematch,
  setRematch,
  showSeries,
  onClose,
}: {
  gameId: string;
  userId: string;
  game: GameJson;
  conversation: ConversationJson | null;
  rematch: RematchState;
  setRematch: React.Dispatch<React.SetStateAction<RematchState>>;
  showSeries: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const { openLayer } = useLayeredPopup();
  const isPlayer = game.players.some((p) => p.userId === userId);
  const canRematch =
    isPlayer && game.status === "completed" && !!game.conversationId;

  const onRematch = useCallback(async () => {
    if (rematch.code) {
      router.push(`/play/${rematch.code}`);
      return;
    }
    setRematch((r) => ({ ...r, busy: true, error: null }));
    try {
      const res = await emitAck<{ gameId: string }>(
        socket,
        CHAT_EVENTS.rematch,
        { gameId },
      );
      router.push(`/play/${res.gameId}`);
    } catch (e) {
      setRematch((r) => ({
        ...r,
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't start the rematch",
      }));
    }
  }, [socket, gameId, rematch.code, router, setRematch]);

  return (
    <div className="flex flex-col gap-2">
      {canRematch ? (
        <Button onClick={onRematch} disabled={rematch.busy}>
          {rematch.code ? "Go to rematch" : "Rematch"}
        </Button>
      ) : null}
      {conversation ? (
        <Button
          variant="secondary"
          onClick={() => router.push(conversationHref(conversation, userId))}
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
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
