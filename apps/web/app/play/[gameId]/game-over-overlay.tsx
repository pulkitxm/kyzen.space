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
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
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

type RematchState = {
  busy: boolean;
  error: string | null;
  code: string | null;
};

type OverlayState = {
  game: GameJson;
  dismissed: boolean;
  detail: SeriesDetail | null;
  rematch: RematchState;
};

type OverlayAction =
  | { type: "reset"; game: GameJson }
  | { type: "game_state"; game: GameJson }
  | { type: "series_loaded"; detail: SeriesDetail }
  | { type: "dismiss" }
  | { type: "reopen" }
  | { type: "rematch_start" }
  | { type: "rematch_fail"; error: string }
  | { type: "rematch_created"; code: string };

function emptyRematch(): RematchState {
  return { busy: false, error: null, code: null };
}

function initialOverlayState(game: GameJson): OverlayState {
  return {
    game,
    dismissed: false,
    detail: null,
    rematch: emptyRematch(),
  };
}

function overlayReducer(
  state: OverlayState,
  action: OverlayAction,
): OverlayState {
  switch (action.type) {
    case "reset":
      return initialOverlayState(action.game);
    case "game_state": {
      const ended = isGameOver(action.game.status);
      return {
        ...state,
        game: action.game,
        dismissed: ended ? false : state.dismissed,
        rematch: ended ? { ...state.rematch, busy: false } : state.rematch,
      };
    }
    case "series_loaded":
      return { ...state, detail: action.detail };
    case "dismiss":
      return { ...state, dismissed: true };
    case "reopen":
      return { ...state, dismissed: false };
    case "rematch_start":
      return {
        ...state,
        rematch: { busy: true, error: null, code: state.rematch.code },
      };
    case "rematch_fail":
      return {
        ...state,
        rematch: { ...state.rematch, busy: false, error: action.error },
      };
    case "rematch_created":
      return {
        ...state,
        rematch: { busy: false, error: null, code: action.code },
      };
    default:
      return state;
  }
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
  const [state, dispatch] = useReducer(
    overlayReducer,
    initialGame,
    initialOverlayState,
  );

  const prevGameIdRef = useRef(gameId);
  if (gameId !== prevGameIdRef.current) {
    prevGameIdRef.current = gameId;
    dispatch({ type: "reset", game: initialGame });
  }

  useSocketEvent<{ game: GameJson }>("game_state", (payload) => {
    dispatch({ type: "game_state", game: payload.game });
  });

  useSocketEvent<{ newGameId: string }>(
    CHAT_EVENTS.rematchCreated,
    (payload) => {
      dispatch({ type: "rematch_created", code: payload.newGameId });
    },
  );

  useEffect(() => {
    if (!isGameOver(state.game.status)) return;
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((series) => {
        if (active) dispatch({ type: "series_loaded", detail: series });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [gameId, state.game.status]);

  const modalOpen = isGameOver(state.game.status) && !state.dismissed;
  const layerCount = layers.length;

  useEffect(() => {
    if (!modalOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (layerCount > 0) return;
      const card = cardRef.current;
      if (card && !card.contains(event.target as Node)) {
        dispatch({ type: "dismiss" });
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [modalOpen, layerCount]);

  const { game, detail, rematch } = state;

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
    dispatch({ type: "rematch_start" });
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
      dispatch({
        type: "rematch_fail",
        error:
          error instanceof Error
            ? error.message
            : "Couldn't continue the match",
      });
    }
  }, [socket, gameId, rematch.code, router]);

  if (!viewModel) return null;

  const pendingLabel = rematch.code
    ? viewModel.primaryAction === "nextRound"
      ? "Go to next round"
      : "Go to rematch"
    : null;

  const showReopen = state.dismissed && isGameOver(game.status);

  return (
    <>
      <GameResultModal
        open={modalOpen}
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
          onClose: () => dispatch({ type: "dismiss" }),
          primaryBusy: rematch.busy,
          primaryError: rematch.error,
          primaryPendingLabel: pendingLabel,
        }}
      />
      <AnimatePresence>
        {showReopen ? (
          <GameResultReopenChip
            headline={viewModel.headline}
            onClick={() => dispatch({ type: "reopen" })}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
