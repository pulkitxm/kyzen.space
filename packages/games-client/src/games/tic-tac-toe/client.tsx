"use client";

import type {
  AvatarConfig,
  Cell,
  TicTacToeState as TicState,
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
import { useGameAudio } from "../../audio/use-game-audio";
import type { GameClientProps } from "../../types";
import { TttMark, TttMarkDefs } from "./marks";
import { PlayerBar } from "./player-bar";
import { WinStrike } from "./win-strike";
import { findWinningLine } from "./winning-line";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: {
    userId: string;
    username: string;
    role: string;
    avatar?: AvatarConfig | null;
  }[];
  gameState: TicState;
};

type MoveJson = Record<string, unknown>;

const CELL_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

const REPLAY_MS = 850;

function emptyBoard(): Cell[] {
  return Array.from({ length: 9 }, () => null as Cell);
}

function sortMoves(moves: MoveJson[]): MoveJson[] {
  return [...moves].sort(
    (a, b) => (Number(a.moveNumber) || 0) - (Number(b.moveNumber) || 0),
  );
}

function roleForPlayer(
  players: GameJson["players"],
  playerId: string,
): "X" | "O" | null {
  const p = players.find((x) => x.userId === playerId);
  return p?.role === "X" || p?.role === "O" ? p.role : null;
}

function buildStateAtStep(
  moves: MoveJson[],
  step: number,
  players: GameJson["players"],
): TicState {
  const board = emptyBoard();
  let currentTurn: "X" | "O" = "X";
  const sorted = sortMoves(moves);
  const n = Math.max(0, Math.min(step, sorted.length));
  for (let i = 0; i < n; i++) {
    const m = sorted[i];
    if (!m) continue;
    const pid = String(m.playerId ?? "");
    const role = roleForPlayer(players, pid);
    const md = m.moveData as { row?: unknown; col?: unknown };
    if (!role || typeof md.row !== "number" || typeof md.col !== "number") {
      continue;
    }
    const idx = md.row * 3 + md.col;
    if (idx < 0 || idx > 8) continue;
    board[idx] = role;
    currentTurn = role === "X" ? "O" : "X";
  }
  return { board, currentTurn };
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

export function TicTacToeGameClient({
  gameId,
  userId,
  socket,
  connected,
  initialGame,
  initialMoves,
}: GameClientProps) {
  const [game, setGame] = useState<GameJson>(initialGame as GameJson);
  const [moves, setMoves] = useState<MoveJson[]>(initialMoves);
  const [error, setError] = useState<string | null>(null);

  const audio = useGameAudio();

  const pastInitially =
    initialGame.status === "completed" || initialGame.status === "abandoned";
  const [replayStep, setReplayStep] = useState(() =>
    pastInitially ? initialMoves.length : 0,
  );
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayStepRef = useRef(replayStep);
  replayStepRef.current = replayStep;

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

  useEffect(() => {
    if (!isPast || !replayPlaying) return;
    const id = window.setInterval(() => {
      const cur = Math.min(replayStepRef.current, sortedLen);
      if (cur >= sortedLen) {
        setReplayPlaying(false);
        return;
      }
      audio.playTouch();
      setReplayStep(cur + 1);
    }, REPLAY_MS);
    return () => window.clearInterval(id);
  }, [isPast, replayPlaying, sortedLen, audio]);

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
    };
    const onMoveMade = (payload: { gameState: TicState }) => {
      setGame((g) => ({ ...g, gameState: payload.gameState }));
    };
    const onGameError = (payload: { message?: string }) => {
      setError(payload.message ?? "Error");
    };

    socket.on("connect", onConnect);
    socket.on("game_state", onGameState);
    socket.on("move_made", onMoveMade);
    socket.on("game_error", onGameError);

    if (socket.connected) socket.emit("join_room", { gameId: gid });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game_state", onGameState);
      socket.off("move_made", onMoveMade);
      socket.off("game_error", onGameError);
      if (socket.connected) socket.emit("leave_room", { gameId: gid });
    };
  }, [socket, liveSocketKey]);

  const liveState = game.gameState ?? {
    board: emptyBoard(),
    currentTurn: "X" as const,
  };

  const replayState = useMemo(
    () =>
      buildStateAtStep(moves, Math.min(replayStep, sortedLen), game.players),
    [moves, replayStep, sortedLen, game.players],
  );

  const state = isPast ? replayState : liveState;

  const myRole = game.players.find((p) => p.userId === userId)?.role ?? null;
  const canMove =
    Boolean(userId) &&
    game.status === "active" &&
    myRole !== null &&
    liveState.currentTurn === myRole;

  const makeMove = useCallback(
    (row: number, col: number) => {
      if (!userId || !canMove) return;
      if (!socket?.connected) return;
      socket.emit("make_move", {
        gameId,
        moveData: { row, col },
      });
    },
    [userId, canMove, gameId, socket],
  );

  const winnerLabel = game.winner
    ? game.winner === "draw"
      ? "Draw"
      : `Winner: ${game.players.find((p) => p.userId === game.winner)?.username ?? game.winner}`
    : null;

  const winningLine =
    game.winner && game.winner !== "draw" ? findWinningLine(state.board) : null;
  const winLineKey = winningLine ? winningLine.join(",") : null;
  const winMark = winningLine ? state.board[winningLine[0]] : null;

  const [winState, setWinState] = useState<{
    key: string | null;
    animate: boolean;
  }>(() => ({ key: winLineKey, animate: false }));
  if (winLineKey !== winState.key) {
    setWinState({ key: winLineKey, animate: winLineKey !== null });
  }

  const prevStatusRef = useRef(initialGame.status);
  const endSoundPlayedRef = useRef(false);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = game.status;
    if (endSoundPlayedRef.current) return;
    const wasLive = prevStatus === "waiting" || prevStatus === "active";
    if (wasLive && game.status === "completed" && game.winner) {
      endSoundPlayedRef.current = true;
      if (game.winner === "draw") audio.playDraw();
      else audio.playWin();
    }
  }, [game.status, game.winner, audio]);

  const liveFilled = useMemo(
    () => liveState.board.reduce((n, cell) => (cell ? n + 1 : n), 0),
    [liveState.board],
  );
  const prevLiveFilledRef = useRef(liveFilled);
  useEffect(() => {
    const prev = prevLiveFilledRef.current;
    prevLiveFilledRef.current = liveFilled;
    if (isPast || liveFilled <= prev) return;
    if (myRole && liveState.currentTurn !== myRole) return;
    audio.playTouch();
  }, [liveFilled, isPast, myRole, liveState.currentTurn, audio]);

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
    const cur = Math.min(replayStepRef.current, sortedLen);
    if (cur >= sortedLen) return;
    audio.playTouch();
    setReplayStep(cur + 1);
  }, [sortedLen, audio]);

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

  return (
    <div className="mt-8">
      <TttMarkDefs />
      <PlayerBar
        players={game.players}
        currentTurn={state.currentTurn}
        myUserId={userId}
        active={game.status === "active"}
      />
      {isPast ? null : !userId ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Sign in to join this table and play. Open the same link while signed
          in as the second player to fill the match.
        </p>
      ) : (
        <div className="mb-4 flex items-center">
          <StatusDot online={Boolean(liveSocketKey) && connected} />
        </div>
      )}

      {error ? <p className="mb-4 text-danger text-sm">{error}</p> : null}

      {winnerLabel ? (
        <p className="mb-4 font-medium text-primary text-sm">{winnerLabel}</p>
      ) : null}

      <div className="relative grid w-fit grid-cols-3 gap-3">
        {CELL_INDICES.map((idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          const mark = state.board[idx];
          const playable =
            !isPast && canMove && mark === null && game.status === "active";
          const ghostMark = playable ? myRole : null;
          return (
            <button
              key={idx}
              type="button"
              disabled={!playable}
              onMouseEnter={() => {
                if (playable) audio.playHover();
              }}
              onClick={() => {
                if (!playable) return;
                audio.playTouch();
                makeMove(row, col);
              }}
              className="group flex size-24 items-center justify-center rounded-xl border border-border bg-surface-raised outline-none transition focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-surface-overlay disabled:cursor-default sm:size-28"
            >
              {mark ? (
                <TttMark mark={mark} className="size-16 sm:size-20" />
              ) : ghostMark ? (
                <TttMark
                  mark={ghostMark}
                  decorative
                  className="size-16 opacity-0 transition-opacity duration-150 group-hover:opacity-40 group-focus-visible:opacity-40 sm:size-20"
                />
              ) : null}
            </button>
          );
        })}
        {winningLine && winMark ? (
          <WinStrike
            line={winningLine}
            mark={winMark}
            animate={winState.animate}
          />
        ) : null}
      </div>

      {isPast ? (
        <>
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
        </>
      ) : (
        <p className="mt-6 text-muted-foreground text-xs">
          Moves logged: {moves.length}
        </p>
      )}
    </div>
  );
}
