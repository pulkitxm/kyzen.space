"use client";

import type { Cell, TicTacToeState as TicState } from "@gamelobby/games-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameClientProps } from "../../types";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
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
        <IconFirst />
      </button>
      <button
        type="button"
        className={glass}
        onClick={onPrev}
        disabled={step <= 0}
        title="Previous move (←)"
      >
        <IconPrev />
      </button>
      <button
        type="button"
        className={`${glass} min-w-13`}
        onClick={onTogglePlay}
        disabled={maxStep === 0}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button
        type="button"
        className={glass}
        onClick={onNext}
        disabled={step >= maxStep}
        title="Next move (→)"
      >
        <IconNext />
      </button>
      <button
        type="button"
        className={glass}
        onClick={onLast}
        disabled={step >= maxStep}
        title="Last move"
      >
        <IconLast />
      </button>
    </div>
  );
}

function IconFirst() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="11 18 6 12 11 6" />
      <polyline points="18 18 13 12 18 6" />
      <line x1="4" y1="4" x2="4" y2="20" />
    </svg>
  );
}

function IconPrev() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconNext() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconLast() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="13 18 18 12 13 6" />
      <polyline points="6 18 11 12 6 6" />
      <line x1="20" y1="4" x2="20" y2="20" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="8 5 19 12 8 19 8 5" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
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
  initialGame,
  initialMoves,
}: GameClientProps) {
  const socketRef = useRef<Socket | null>(null);
  const [game, setGame] = useState<GameJson>(initialGame as GameJson);
  const [moves, setMoves] = useState<MoveJson[]>(initialMoves);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const pastInitially =
    initialGame.status === "completed" || initialGame.status === "abandoned";
  const [replayStep, setReplayStep] = useState(() =>
    pastInitially ? initialMoves.length : 0,
  );
  const [replayPlaying, setReplayPlaying] = useState(false);

  const socketUrl = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOCKET_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

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

  useEffect(() => {
    if (!liveSocketKey) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const { gameId: gid } = liveSocketKey;

    const socket: Socket = io(socketUrl, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      socket.emit("join_room", { gameId: gid });
    });

    socket.on("connect_error", (err) => {
      setConnected(false);
      setError(err.message);
    });

    socket.on(
      "game_state",
      (payload: { game: GameJson; moves: MoveJson[] }) => {
        setGame(payload.game);
        setMoves(payload.moves);
      },
    );

    socket.on("move_made", (payload: { gameState: TicState }) => {
      setGame((g) => ({ ...g, gameState: payload.gameState }));
    });

    socket.on("game_error", (payload: { message?: string }) => {
      setError(payload.message ?? "Error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [liveSocketKey, socketUrl]);

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
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("make_move", {
        gameId,
        moveData: { row, col },
      });
    },
    [userId, canMove, gameId],
  );

  const winnerLabel = game.winner
    ? game.winner === "draw"
      ? "Draw"
      : `Winner: ${game.players.find((p) => p.userId === game.winner)?.username ?? game.winner}`
    : null;

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

  return (
    <div className="mt-8">
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

      <div className="grid w-fit grid-cols-3 gap-3">
        {CELL_INDICES.map((idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          const mark = state.board[idx];
          return (
            <button
              key={idx}
              type="button"
              disabled={
                isPast || !canMove || mark !== null || game.status !== "active"
              }
              onClick={() => makeMove(row, col)}
              className="flex size-24 items-center justify-center rounded-xl border border-border bg-surface-raised font-semibold text-5xl text-card-foreground outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60 sm:size-28"
            >
              {mark ?? ""}
            </button>
          );
        })}
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
