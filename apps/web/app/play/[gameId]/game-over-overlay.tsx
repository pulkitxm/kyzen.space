"use client";

import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  buildGameResultViewModel,
  type ConversationJson,
  type GameJson,
  isGameOver,
  type SeriesDetail,
} from "@kyzen/shared/types";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GameResultModal,
  GameResultReopenChip,
} from "@/components/games/game-result-modal";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { clientFetchJson } from "@/lib/api-client";
import { conversationHref } from "@/lib/chat/conversation-href";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";

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
  const [open, setOpen] = useState(() => isGameOver(initialGame.status));
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [rematch, setRematch] = useState<{
    busy: boolean;
    error: string | null;
    code: string | null;
  }>({ busy: false, error: null, code: null });

  useEffect(() => {
    setGame(initialGame);
    setOpen(isGameOver(initialGame.status));
    setDetail(null);
    setRematch({ busy: false, error: null, code: null });
  }, [initialGame]);

  useSocketEvent<{ game: GameJson }>("game_state", (payload) => {
    setGame(payload.game);
    if (isGameOver(payload.game.status)) {
      setOpen(true);
      setRematch((state) => ({ ...state, busy: false }));
    }
  });

  useSocketEvent<{ newGameId: string }>(
    CHAT_EVENTS.rematchCreated,
    (payload) => {
      setRematch((state) => ({
        ...state,
        busy: false,
        code: payload.newGameId,
      }));
    },
  );

  useEffect(() => {
    if (!isGameOver(game.status)) return;
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((series) => {
        if (active) setDetail(series);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [gameId, game.status]);

  const layerCount = layers.length;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (layerCount > 0) return;
      const card = cardRef.current;
      if (card && !card.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, layerCount]);

  const canContinue =
    game.players.some((player) => player.userId === userId) &&
    game.status === "completed";

  const viewModel = useMemo(
    () =>
      buildGameResultViewModel({
        game,
        userId,
        series: detail,
        canContinue,
      }),
    [game, userId, detail, canContinue],
  );

  const onContinue = useCallback(async () => {
    if (rematch.code) {
      router.push(`/play/${rematch.code}`);
      return;
    }
    setRematch((state) => ({ ...state, busy: true, error: null }));
    try {
      const res = await emitAck<{ ok?: boolean; gameId?: string }>(
        socket,
        CHAT_EVENTS.rematch,
        { gameId },
      );
      const nextCode = res.gameId;
      if (!nextCode) throw new Error("No game code returned");
      router.push(`/play/${nextCode}`);
    } catch (error) {
      setRematch((state) => ({
        ...state,
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : "Couldn't continue the match",
      }));
    }
  }, [socket, gameId, rematch.code, router]);

  if (!viewModel) return null;

  const pendingLabel = rematch.code
    ? viewModel.primaryAction === "nextRound"
      ? "Go to next round"
      : "Go to rematch"
    : null;

  const showReopen = !open && isGameOver(game.status);

  return (
    <>
      <GameResultModal
        open={open}
        model={viewModel}
        userId={userId}
        draws={detail?.score.draws ?? (game.winner === "draw" ? 1 : 0)}
        cardRef={cardRef}
        actions={{
          onPrimary: canContinue ? onContinue : undefined,
          onChat: conversation
            ? () => router.push(conversationHref(conversation, userId))
            : undefined,
          onViewSeries: viewModel.showSeriesHistory
            ? () =>
                openLayer({
                  title: "Series",
                  content: <SeriesDetailModal gameId={gameId} />,
                  size: "md",
                })
            : undefined,
          onClose: () => setOpen(false),
          primaryBusy: rematch.busy,
          primaryError: rematch.error,
          primaryPendingLabel: pendingLabel,
        }}
      />
      <AnimatePresence>
        {showReopen ? (
          <GameResultReopenChip
            headline={viewModel.headline}
            onClick={() => setOpen(true)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
