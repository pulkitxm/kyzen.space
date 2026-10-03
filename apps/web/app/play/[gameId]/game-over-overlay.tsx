"use client";

import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  type ConversationJson,
  type GameJson,
  isBotId,
  isGameOver,
  type SeriesDetail,
  type ServerRematchCreated,
} from "@kyzen/shared/types";
import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaRobot, FaTrophy } from "react-icons/fa6";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { GlassMotionPane } from "@/components/glass/glass-pane";
import { Button, Character } from "@/components/ui";
import { clientFetchJson } from "@/lib/api-client";
import { conversationHref } from "@/lib/chat/conversation-href";
import {
  gameWinners,
  outcomeLabel,
  resultRevealDelay,
} from "@/lib/games/outcome";
import { findMatchHref } from "@/lib/games/queues";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

function PlayersRow({ game }: { game: GameJson }) {
  const winners = new Set(gameWinners(game));
  const compact = game.players.length > 4;
  return (
    <ul className="flex max-h-60 flex-wrap items-start justify-center gap-x-6 gap-y-3 overflow-y-auto p-1.5">
      {game.players.map((p) => {
        const won = winners.has(p.userId);
        return (
          <li key={p.userId} className="flex w-20 flex-col items-center gap-1">
            <div
              className={cn(
                "rounded-full",
                won &&
                  "ring-2 ring-amber-500 ring-offset-2 ring-offset-surface-raised",
              )}
            >
              {isBotId(p.userId) ? (
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 border-card bg-surface-overlay text-muted-foreground",
                    compact ? "size-10" : "size-14",
                  )}
                >
                  <FaRobot size={compact ? 18 : 24} aria-hidden="true" />
                </span>
              ) : (
                <Character
                  config={p.avatar ?? null}
                  fallbackSeed={p.username}
                  size={compact ? 40 : 56}
                  className="rounded-full border-2 border-card bg-surface-overlay"
                />
              )}
            </div>
            <span className="max-w-full truncate text-sm">{p.username}</span>
            {won ? (
              <FaTrophy
                className="text-amber-500"
                size={14}
                role="img"
                aria-label="Winner"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function useResultsReady(
  completedAt: string | null | undefined,
  delayMs: number,
): boolean {
  const key = delayMs > 0 ? `${completedAt ?? ""}:${delayMs}` : null;
  const [revealed, setRevealed] = useState(() =>
    key !== null && resultRevealDelay(completedAt, delayMs, Date.now()) === 0
      ? key
      : null,
  );

  useEffect(() => {
    if (key === null || revealed === key) return;
    const timer = setTimeout(
      () => setRevealed(key),
      resultRevealDelay(completedAt, delayMs, Date.now()),
    );
    return () => clearTimeout(timer);
  }, [key, revealed, completedAt, delayMs]);

  return key === null || revealed === key;
}

export function GameOverOverlay({
  gameId,
  userId,
  game,
  conversation,
  resultDelayMs,
  covered = false,
}: {
  gameId: string;
  userId: string;
  game: GameJson;
  conversation: ConversationJson | null;
  resultDelayMs: number;
  covered?: boolean;
}) {
  const { layers } = useLayeredPopup();
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(() => isGameOver(game.status));
  const ready = useResultsReady(game.completedAt, resultDelayMs);
  const visible = open && ready && !covered && isGameOver(game.status);
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

  useSocketEvent<ServerRematchCreated>(
    CHAT_EVENTS.rematchCreated,
    (payload) => {
      if (payload.previousGameId && payload.previousGameId !== gameId) return;
      setRematch((r) => ({ ...r, code: payload.newGameId }));
    },
  );

  const hasSeries = !game.publicMatch;
  useEffect(() => {
    if (!open || !hasSeries || !isGameOver(game.status)) return;
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, hasSeries, gameId, game.status]);

  const layerCount = layers.length;
  useEffect(() => {
    if (!visible) return;
    function onPointerDown(e: MouseEvent) {
      if (layerCount > 0) return;
      const card = cardRef.current;
      const target = e.target;
      if (!card || !(target instanceof Element)) return;
      if (card.contains(target) || target.closest('[role="tablist"]')) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [visible, layerCount]);

  const showSeries = (detail?.score.totalGames ?? 0) >= 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {visible ? (
            <GlassMotionPane
              ref={cardRef}
              className={cn(
                "pointer-events-auto max-h-full w-full overflow-y-auto rounded-2xl border border-border bg-surface-raised p-6",
                game.players.length > 4 ? "max-w-md" : "max-w-sm",
              )}
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
  const privateRoom = !game.publicMatch && !game.conversationId;
  const canRematch =
    isPlayer && game.status === "completed" && !game.publicMatch;

  const rematchPending = useRef(false);

  const onRematch = useCallback(async () => {
    if (rematchPending.current) return;
    rematchPending.current = true;
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
      rematchPending.current = false;
      setRematch((r) => ({
        ...r,
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't start the rematch",
      }));
    }
  }, [socket, gameId, rematch.code, router, setRematch]);

  return (
    <div className="flex flex-col gap-2">
      {game.publicMatch ? (
        <Button onClick={() => router.push(findMatchHref(game))}>
          Play again
        </Button>
      ) : null}
      {canRematch ? (
        <Button onClick={onRematch} disabled={rematch.busy}>
          {rematch.code
            ? "Go to rematch"
            : privateRoom
              ? "Play again"
              : "Rematch"}
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
