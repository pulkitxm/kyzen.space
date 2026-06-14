"use client";

import { applyAction, monopolyEngine } from "@gamelobby/games-core";
import type {
  GamePlayer,
  MonopolyMove,
  MonopolyState,
  Tile,
} from "@gamelobby/shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaBackwardStep,
  FaChevronLeft,
  FaChevronRight,
  FaForwardStep,
  FaPause,
  FaPlay,
} from "react-icons/fa6";
import type { GameClientProps } from "../../types";
import { Board } from "./Board";
import { Controls } from "./Controls";
import { FloatingTexts, useBoardSize } from "./FloatingTexts";
import { PropertyPanel } from "./PropertyPanel";
import { useGamePhase } from "./useGamePhase";
import { useSound } from "./useSound";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: GamePlayer[];
  gameState: MonopolyState;
};

type MoveJson = {
  id: string;
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: Record<string, unknown>;
  createdAt: string;
};

const REPLAY_MS = 1000;

function sortMoves(moves: MoveJson[]): MoveJson[] {
  return [...moves].sort(
    (a, b) => (Number(a.moveNumber) || 0) - (Number(b.moveNumber) || 0),
  );
}

function buildStateAtStep(
  moves: MoveJson[],
  step: number,
  players: GameJson["players"],
): MonopolyState {
  const sortedPlayers = [...players].sort((a, b) =>
    a.role.localeCompare(b.role),
  );
  const seats = sortedPlayers.map((p) => ({ role: p.role }));
  let state = monopolyEngine.createInitialState(seats);

  const sorted = sortMoves(moves);
  const n = Math.max(0, Math.min(step, sorted.length));
  for (let i = 0; i < n; i++) {
    const m = sorted[i];
    if (!m) continue;
    state = applyAction(state, m.moveData as MonopolyMove);
  }
  return state;
}

function ReplayToolbar({
  step,
  maxStep,
  isPlaying,
  onFirst,
  onPrev,
  onTogglePlay,
  onNext,
  onLast,
}: {
  step: number;
  maxStep: number;
  isPlaying: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const glass =
    "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-3 text-card-foreground shadow-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div
      className="mt-6 flex max-w-[320px] flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface-overlay/60 p-2"
      role="toolbar"
      aria-label="Replay controls"
    >
      <button
        type="button"
        className={glass}
        onClick={onFirst}
        disabled={step <= 0}
        title="First"
      >
        <FaBackwardStep size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={glass}
        onClick={onPrev}
        disabled={step <= 0}
        title="Previous move (←)"
      >
        <FaChevronLeft size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${glass} min-w-13`}
        onClick={onTogglePlay}
        disabled={maxStep === 0}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <FaPause size={20} aria-hidden="true" />
        ) : (
          <FaPlay size={20} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={glass}
        onClick={onNext}
        disabled={step >= maxStep}
        title="Next move (→)"
      >
        <FaChevronRight size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={glass}
        onClick={onLast}
        disabled={step >= maxStep}
        title="Last move"
      >
        <FaForwardStep size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  const tone = online ? "bg-success" : "bg-danger";
  return (
    <span
      className="relative inline-flex size-3 items-center justify-center"
      role="status"
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
    >
      <span
        className={`absolute inline-flex size-3 animate-ping rounded-full opacity-70 ${tone}`}
      />
      <span className={`relative inline-flex size-2.5 rounded-full ${tone}`} />
    </span>
  );
}

export function MonopolyGameClient({
  gameId,
  userId,
  socket,
  connected,
  initialGame,
  initialMoves,
}: GameClientProps) {
  const sounds = useSound();
  const [game, setGame] = useState<GameJson>(initialGame as GameJson);
  const [moves, setMoves] = useState<MoveJson[]>(initialMoves as MoveJson[]);
  const [error, setError] = useState<string | null>(null);

  const pastInitially =
    initialGame.status === "completed" || initialGame.status === "abandoned";
  const [replayStep, setReplayStep] = useState(() =>
    pastInitially ? initialMoves.length : 0,
  );
  const [replayPlaying, setReplayPlaying] = useState(false);

  const isLive = game.status === "waiting" || game.status === "active";
  const isPast = game.status === "completed" || game.status === "abandoned";
  const sortedLen = useMemo(() => sortMoves(moves).length, [moves]);

  const liveSocketKey = useMemo((): {
    gameId: string;
    userId: string;
  } | null => {
    if (!userId || !isLive) return null;
    return { gameId, userId };
  }, [gameId, userId, isLive]);

  const { ref: boardRef, size: boardSize } = useBoardSize();

  const myRole = useMemo(() => {
    return game.players.find((p) => p.userId === userId)?.role ?? null;
  }, [game.players, userId]);

  const liveState = game.gameState;
  const isMyTurn =
    isLive &&
    myRole !== null &&
    liveState.currentPlayerIndex !== undefined &&
    liveState.players[liveState.currentPlayerIndex]?.id === myRole;

  const makeMove = useCallback(
    (action: MonopolyMove) => {
      if (!isLive || !myRole) return;
      if (!socket?.connected) return;
      socket.emit("make_move", {
        gameId,
        moveData: action,
      });
    },
    [isLive, myRole, gameId, socket],
  );

  const {
    uiPhase,
    diceAnimPhase,
    diceDisplay,
    animatedPositions,
    destinationCell,
    floatingTexts,
    triggerRollAnimation,
    addFloat,
    cardDrawCountdown,
    endTurnCountdown,
    drawnCard,
    mustDrawCard,
    onDrawCard,
  } = useGamePhase(liveState, makeMove, isMyTurn);

  const [displayedState, setDisplayedState] =
    useState<MonopolyState>(liveState);
  const displayedStateRef = useRef<MonopolyState>(displayedState);
  useEffect(() => {
    displayedStateRef.current = displayedState;
  }, [displayedState]);

  const prevBalancesRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const prev = prevBalancesRef.current;
    displayedState.players.forEach((p) => {
      const old = prev[p.id];
      if (old !== undefined && old !== p.balance) {
        const diff = p.balance - old;
        const color = diff > 0 ? "#4ade80" : "#f87171";
        addFloat(
          diff > 0 ? `+$${diff}` : `-$${Math.abs(diff)}`,
          p.position,
          color,
        );
      }
      prev[p.id] = p.balance;
    });
  }, [displayedState, addFloat]);

  useEffect(() => {
    if (isLive) {
      setDisplayedState(liveState);
    }
  }, [liveState, isLive]);

  useEffect(() => {
    if (!isPast || !replayPlaying) return;
    const id = window.setInterval(() => {
      setReplayStep((s) => {
        const cur = Math.min(s, sortedLen);
        if (cur >= sortedLen) {
          queueMicrotask(() => setReplayPlaying(false));
          return sortedLen;
        }
        return cur + 1;
      });
    }, REPLAY_MS);
    return () => window.clearInterval(id);
  }, [isPast, replayPlaying, sortedLen]);

  const prevIsLiveRef = useRef(
    initialGame.status === "waiting" || initialGame.status === "active",
  );

  useEffect(() => {
    if (prevIsLiveRef.current && !isLive && isPast) {
      setReplayStep(sortMoves(moves).length);
      setReplayPlaying(false);
    }
    prevIsLiveRef.current = isLive;
  }, [isLive, isPast, moves]);

  const triggerAnimationRef = useRef(triggerRollAnimation);
  useEffect(() => {
    triggerAnimationRef.current = triggerRollAnimation;
  }, [triggerRollAnimation]);

  useEffect(() => {
    if (!socket || !liveSocketKey) return;

    const { gameId: gid } = liveSocketKey;

    const onConnect = () => {
      setError(null);
      socket.emit("join_room", { gameId: gid });
    };

    const onGameState = (payload: { game: GameJson; moves: MoveJson[] }) => {
      setGame(payload.game);
      setMoves(payload.moves);
      setDisplayedState(payload.game.gameState);
    };

    const onMoveMade = (payload: {
      move: MoveJson;
      gameState: MonopolyState;
    }) => {
      const md = payload.move.moveData as MonopolyMove;
      if (md.type === "ROLL_DICE") {
        const d1 = md.payload.die1;
        const d2 = md.payload.die2;
        const pState = displayedStateRef.current;
        const activePlayer = pState.players[pState.currentPlayerIndex];
        if (activePlayer) {
          triggerAnimationRef.current(d1, d2, activePlayer.position, () => {
            setDisplayedState(payload.gameState);
            setGame((g) => ({ ...g, gameState: payload.gameState }));
          });
        } else {
          setDisplayedState(payload.gameState);
          setGame((g) => ({ ...g, gameState: payload.gameState }));
        }
      } else {
        if (md.type === "BUY_PROPERTY") sounds.playBuy();
        else if (md.type === "DRAW_CARD") sounds.playCardDraw();
        else if (md.type === "DECLARE_BANKRUPTCY") sounds.playJail();

        setDisplayedState(payload.gameState);
        setGame((g) => ({ ...g, gameState: payload.gameState }));
      }
      setMoves((m) => [...m, payload.move]);
    };

    const onGameOver = (payload: { winner: string | null }) => {
      setGame((g) => ({ ...g, status: "completed", winner: payload.winner }));
    };

    const onGameError = (payload: { message?: string }) => {
      setError(payload.message ?? "Error");
    };

    socket.on("connect", onConnect);
    socket.on("game_state", onGameState);
    socket.on("move_made", onMoveMade);
    socket.on("game_over", onGameOver);
    socket.on("game_error", onGameError);

    if (socket.connected) socket.emit("join_room", { gameId: gid });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game_state", onGameState);
      socket.off("move_made", onMoveMade);
      socket.off("game_over", onGameOver);
      socket.off("game_error", onGameError);
      if (socket.connected) socket.emit("leave_room", { gameId: gid });
    };
  }, [socket, liveSocketKey, sounds]);

  const replayState = useMemo(() => {
    return buildStateAtStep(
      moves,
      Math.min(replayStep, sortedLen),
      game.players,
    );
  }, [moves, replayStep, sortedLen, game.players]);

  const state = isPast ? replayState : displayedState;

  const mappedState = useMemo(() => {
    if (!state) return state;
    return {
      ...state,
      players: state.players.map((p) => {
        const gp = game.players.find((x) => x.role === p.id);
        return {
          ...p,
          name: gp?.username ?? p.name,
          avatar: gp?.avatar ?? null,
        };
      }),
      log: state.log.map((logMsg) => {
        let msg = logMsg;
        state.players.forEach((p) => {
          const username = game.players.find(
            (gp) => gp.role === p.id,
          )?.username;
          if (username) {
            msg = msg.replaceAll(p.name, username);
          }
        });
        return msg;
      }),
    };
  }, [state, game.players]);

  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const onRollClick = useCallback(() => {
    if (uiPhase !== "WAITING_FOR_ROLL" || !isMyTurn) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    makeMove({
      type: "ROLL_DICE",
      payload: { die1: d1, die2: d2 },
    });
  }, [uiPhase, isMyTurn, makeMove]);

  const goFirst = useCallback(() => {
    setReplayPlaying(false);
    setReplayStep(0);
  }, []);

  const goPrev = useCallback(() => {
    setReplayPlaying(false);
    setReplayStep((s) => {
      const cur = Math.min(s, sortedLen);
      return Math.max(0, cur - 1);
    });
  }, [sortedLen]);

  const goNext = useCallback(() => {
    setReplayPlaying(false);
    setReplayStep((s) => {
      const cur = Math.min(s, sortedLen);
      return Math.min(sortedLen, cur + 1);
    });
  }, [sortedLen]);

  const goLast = useCallback(() => {
    setReplayPlaying(false);
    setReplayStep(sortedLen);
  }, [sortedLen]);

  const toggleReplayPlay = useCallback(() => {
    setReplayPlaying((wasPlaying) => {
      if (wasPlaying) return false;
      setReplayStep((s) => {
        const cur = Math.min(s, sortedLen);
        if (sortedLen <= 0) return 0;
        if (cur >= sortedLen) return 0;
        return cur;
      });
      return true;
    });
  }, [sortedLen]);

  useEffect(() => {
    if (!isPast) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }

      if (e.code === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.code === "Space") {
        if (sortedLen <= 0) return;
        e.preventDefault();
        toggleReplayPlay();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isPast, sortedLen, goPrev, goNext, toggleReplayPlay]);

  const winnerLabel = useMemo(() => {
    if (!game.winner) return null;
    if (game.winner === "draw") return "Draw";
    const winnerPlayer = game.players.find((p) => p.userId === game.winner);
    return `Winner: ${winnerPlayer?.username ?? game.winner}`;
  }, [game.winner, game.players]);

  if (!mappedState) return null;

  const isMoving = uiPhase === "MOVING";
  const activePlayer = mappedState.players[mappedState.currentPlayerIndex];
  const landingPos =
    uiPhase === "LANDING" && activePlayer ? activePlayer.position : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-start overflow-hidden">
      {isPast ? null : !userId ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Sign in to join this table and play.
        </p>
      ) : (
        <div className="mb-4 flex items-center">
          <StatusDot online={connected} />
        </div>
      )}

      {error && <p className="mb-4 text-danger text-sm">{error}</p>}

      {winnerLabel && (
        <p className="mb-4 font-medium text-primary text-sm">{winnerLabel}</p>
      )}

      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "8px 12px 16px",
          alignItems: "stretch",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            height: "100%",
            position: "relative",
          }}
        >
          <Board
            state={mappedState}
            animatedPositions={animatedPositions}
            isMoving={isMoving}
            landingPosition={landingPos}
            destinationCell={destinationCell}
            mustDrawCard={mustDrawCard}
            onTileClick={(tile) => setSelectedTile(tile)}
            dispatch={makeMove}
            boardRef={boardRef}
            boardSize={boardSize}
          />
          <FloatingTexts texts={floatingTexts} boardSize={boardSize} />
        </div>

        <div style={{ flexShrink: 0, height: "100%" }}>
          <Controls
            state={mappedState}
            dispatch={makeMove}
            onRoll={onRollClick}
            uiPhase={uiPhase}
            diceAnimPhase={diceAnimPhase}
            diceDisplay={diceDisplay}
            cardDrawCountdown={cardDrawCountdown}
            endTurnCountdown={endTurnCountdown}
            drawnCard={drawnCard}
            onDrawCard={onDrawCard}
            isMyTurn={isMyTurn}
          />
        </div>

        {selectedTile && (
          <PropertyPanel
            tile={selectedTile}
            state={mappedState}
            dispatch={makeMove}
            onClose={() => setSelectedTile(null)}
          />
        )}
      </div>

      {isPast && (
        <div className="flex flex-col items-center justify-center">
          <ReplayToolbar
            step={Math.min(replayStep, sortedLen)}
            maxStep={sortedLen}
            isPlaying={replayPlaying}
            onFirst={goFirst}
            onPrev={goPrev}
            onTogglePlay={toggleReplayPlay}
            onNext={goNext}
            onLast={goLast}
          />
          <p className="mt-3 text-muted-foreground text-xs">
            Position after {Math.min(replayStep, sortedLen)} of {sortedLen}{" "}
            moves
          </p>
        </div>
      )}
    </div>
  );
}
export { MonopolyGameClient as MonopolyBoard };
export default MonopolyGameClient;
