"use client";

import {
  type AvatarConfig,
  type Cell,
  isGameLive,
  isGameOver,
  type Mark,
  type TicTacToeState as TicState,
} from "@kyzen/shared/types";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  type MoveEntry,
  MoveLog,
  ReactionsBar,
  Spectators,
} from "./arena-panels";
import { TttBoard } from "./board";
import { TttMark, TttMarkDefs } from "./marks";
import { MatchSummary } from "./match-summary";
import { friendWatchers, matchSummary, spectatorCount } from "./mock-arena";
import { type CardPlayer, PlayerCard } from "./player-card";
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
  turnDeadline?: number | null;
};

type MoveJson = Record<string, unknown>;

const REPLAY_MS = 850;

const CELL_LABELS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

function emptyBoard(): Cell[] {
  return Array.from({ length: 9 }, () => null as Cell);
}

function sortMoves(moves: MoveJson[]): MoveJson[] {
  return [...moves].sort(
    (a, b) => (Number(a.moveNumber) || 0) - (Number(b.moveNumber) || 0),
  );
}

function appendMove(moves: MoveJson[], move: MoveJson): MoveJson[] {
  const num = Number(move.moveNumber);
  if (moves.some((m) => Number(m.moveNumber) === num)) return moves;
  return [...moves, move];
}

function roleForPlayer(
  players: GameJson["players"],
  playerId: string,
): Mark | null {
  const p = players.find((x) => x.userId === playerId);
  return p?.role === "X" || p?.role === "O" ? p.role : null;
}

function buildStateAtStep(
  moves: MoveJson[],
  step: number,
  players: GameJson["players"],
): TicState {
  const board = emptyBoard();
  let currentTurn: Mark = "X";
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

function moveEntries(
  moves: MoveJson[],
  players: GameJson["players"],
  upTo: number,
): MoveEntry[] {
  const sorted = sortMoves(moves);
  const n = Math.max(0, Math.min(upTo, sorted.length));
  const out: MoveEntry[] = [];
  for (let i = 0; i < n; i++) {
    const m = sorted[i];
    if (!m) continue;
    const role = roleForPlayer(players, String(m.playerId ?? ""));
    const md = m.moveData as { row?: unknown; col?: unknown };
    if (!role || typeof md.row !== "number" || typeof md.col !== "number") {
      continue;
    }
    const idx = md.row * 3 + md.col;
    out.push({
      id: String(m.moveNumber ?? i),
      mark: role,
      label: CELL_LABELS[idx] ?? "center",
    });
  }
  return out;
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
  const btn =
    "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised px-3 text-card-foreground shadow-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div
      className="flex max-w-[320px] flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface-overlay/60 p-2"
      role="toolbar"
      aria-label="Replay controls"
    >
      <button
        type="button"
        className={btn}
        onClick={onFirst}
        disabled={step <= 0}
        title="First"
      >
        <FaBackwardStep size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={onPrev}
        disabled={step <= 0}
        title="Previous move (←)"
      >
        <FaChevronLeft size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${btn} min-w-13`}
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
        className={btn}
        onClick={onNext}
        disabled={step >= maxStep}
        title="Next move (→)"
      >
        <FaChevronRight size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={onLast}
        disabled={step >= maxStep}
        title="Last move"
      >
        <FaForwardStep size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function TurnBanner({
  active,
  currentTurn,
  isMyTurn,
  hasRole,
  outcome,
}: {
  active: boolean;
  currentTurn: Mark;
  isMyTurn: boolean;
  hasRole: boolean;
  outcome: string | null;
}) {
  const label = outcome
    ? outcome
    : active
      ? hasRole
        ? isMyTurn
          ? "Your move"
          : "Opponent's move"
        : `${currentTurn} to move`
      : "Setting up the match";

  return (
    <div className="relative flex items-center gap-2.5 rounded-full border border-border bg-surface-raised px-5 py-2">
      {active && !outcome ? (
        <TttMark mark={currentTurn} className="size-5" />
      ) : null}
      <span className="font-semibold text-card-foreground text-sm">
        {label}
      </span>
      {active && !outcome ? (
        <m.span
          aria-hidden="true"
          className="absolute right-4 bottom-0 left-4 h-0.5 origin-left rounded-full bg-primary"
          initial={{ scaleX: 0.2, opacity: 0.5 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            duration: 1.1,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "reverse",
          }}
        />
      ) : null}
    </div>
  );
}

type FloatingReaction = { id: number; emoji: string; offset: number };

function FloatingReactions({ items }: { items: FloatingReaction[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {items.map((r) => (
          <m.span
            key={r.id}
            className="absolute bottom-6 text-3xl"
            style={{ left: `${r.offset}%` }}
            initial={{ opacity: 0, y: 10, scale: 0.6 }}
            animate={{
              opacity: reduceMotion ? 1 : [0, 1, 1, 0],
              y: reduceMotion ? -20 : -120,
              scale: 1,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.4 : 1.5, ease: "easeOut" }}
          >
            {r.emoji}
          </m.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function SeatCard({
  player,
  variant,
  userId,
  active,
  currentTurn,
  winnerId,
  connected,
  turnDeadline,
  onViewProfile,
}: {
  player: CardPlayer | null;
  variant: "rail" | "strip";
  userId: string | null;
  active: boolean;
  currentTurn: Mark;
  winnerId: string | null;
  connected: boolean;
  turnDeadline: number | null;
  onViewProfile?: (user: {
    username: string;
    avatar?: AvatarConfig | null;
  }) => void;
}) {
  if (!player) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-border border-dashed bg-surface-raised/50 px-4 py-5 text-center text-muted-foreground text-sm">
        Waiting for a player
      </div>
    );
  }
  const mark =
    player.role === "X" || player.role === "O" ? (player.role as Mark) : null;
  const isMe = player.userId === userId;
  return (
    <PlayerCard
      player={player}
      variant={variant}
      isTurn={active && mark !== null && mark === currentTurn}
      isMe={isMe}
      isWinner={winnerId === player.userId}
      online={isMe ? connected : true}
      turnDeadline={turnDeadline}
      onViewProfile={onViewProfile}
    />
  );
}

export function TicTacToeGameClient({
  gameId,
  userId,
  socket,
  connected,
  initialGame,
  initialMoves,
  onViewProfile,
}: GameClientProps) {
  const [game, setGame] = useState<GameJson>(initialGame as GameJson);
  const [moves, setMoves] = useState<MoveJson[]>(initialMoves);
  const [error, setError] = useState<string | null>(null);

  const audio = useGameAudio();

  const pastInitially = isGameOver(initialGame.status);
  const [replayStep, setReplayStep] = useState(() =>
    pastInitially ? initialMoves.length : 0,
  );
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayStepRef = useRef(replayStep);
  replayStepRef.current = replayStep;

  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const reactionIdRef = useRef(0);

  const spawnReaction = useCallback(
    (emoji: string) => {
      const id = ++reactionIdRef.current;
      const offset = 12 + ((id * 37) % 70);
      setReactions((prev) => [...prev, { id, emoji, offset }]);
      audio.playTouch();
      window.setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 1600);
    },
    [audio],
  );

  const isLive = isGameLive(game.status);
  const isPast = isGameOver(game.status);
  const active = game.status === "active";

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

  const [wasLive, setWasLive] = useState(() => isGameLive(initialGame.status));

  if (wasLive !== isLive) {
    setWasLive(isLive);
    if (wasLive && !isLive && isPast) {
      setReplayStep(sortedLen);
      setReplayPlaying(false);
    }
  }

  useEffect(() => {
    if (!socket || !liveSocketKey) return;

    const { gameId: gid } = liveSocketKey;

    const onConnect = () => {
      setError(null);
      socket.emit("join_room", { gameId: gid });
    };
    const onGameState = (payload: {
      game: GameJson;
      moves?: MoveJson[];
      move?: MoveJson;
    }) => {
      setGame(payload.game);
      if (payload.moves) {
        setMoves(payload.moves);
      } else if (payload.move) {
        const m = payload.move;
        setMoves((prev) => appendMove(prev, m));
      }
    };
    const onGameError = (payload: { message?: string }) => {
      setError(payload.message ?? "Error");
    };

    socket.on("connect", onConnect);
    socket.on("game_state", onGameState);
    socket.on("game_error", onGameError);

    if (socket.connected) socket.emit("join_room", { gameId: gid });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game_state", onGameState);
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

  const myRole = (game.players.find((p) => p.userId === userId)?.role ??
    null) as Mark | null;
  const canMove =
    Boolean(userId) &&
    active &&
    myRole !== null &&
    liveState.currentTurn === myRole;

  const makeMove = useCallback(
    (row: number, col: number) => {
      if (!userId || !canMove) return;
      if (!socket?.connected) return;
      audio.playTouch();
      socket.emit("make_move", {
        gameId,
        moveData: { row, col },
      });
    },
    [userId, canMove, gameId, socket, audio],
  );

  const winnerLabel = game.winner
    ? game.winner === "draw"
      ? "It's a draw"
      : game.winner === userId
        ? "You won!"
        : `${game.players.find((p) => p.userId === game.winner)?.username ?? "Opponent"} won`
    : null;

  const winningLine =
    game.winner && game.winner !== "draw" ? findWinningLine(state.board) : null;
  const winLineKey = winningLine ? winningLine.join(",") : null;
  const winMark = winningLine ? (state.board[winningLine[0]] ?? null) : null;

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
    const wasLiveStatus = isGameLive(prevStatus);
    if (wasLiveStatus && game.status === "completed" && game.winner) {
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

  const onReplayKey = useEffectEvent((e: KeyboardEvent) => {
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
  });

  useEffect(() => {
    if (!isPast) return;
    const onKeyDown = (e: KeyboardEvent) => onReplayKey(e);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isPast]);

  const playerX = game.players.find((p) => p.role === "X") ?? null;
  const playerO = game.players.find((p) => p.role === "O") ?? null;

  const boardGlow = isPast
    ? Boolean(winningLine)
    : active && (!myRole || liveState.currentTurn === myRole);

  const replayShown = Math.min(replayStep, sortedLen);
  const logEntries = useMemo(
    () => moveEntries(moves, game.players, isPast ? replayShown : sortedLen),
    [moves, game.players, isPast, replayShown, sortedLen],
  );

  const specCount = useMemo(() => spectatorCount(gameId), [gameId]);
  const watchers = useMemo(() => friendWatchers(gameId), [gameId]);

  const summaryResult: "win" | "loss" | "draw" | null =
    isPast && game.winner
      ? game.winner === "draw"
        ? "draw"
        : game.winner === userId
          ? "win"
          : "loss"
      : null;
  const summary = useMemo(
    () => (summaryResult ? matchSummary(gameId, summaryResult) : null),
    [gameId, summaryResult],
  );

  const seatProps = {
    userId,
    active,
    currentTurn: state.currentTurn,
    winnerId: game.winner,
    connected,
    turnDeadline: game.turnDeadline ?? null,
    onViewProfile,
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="@container w-full pt-2">
        <TttMarkDefs />

        {error ? (
          <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-sm">
            {error}
          </p>
        ) : null}

        <div className="grid @5xl:grid-cols-[17rem_minmax(0,1fr)_18rem] @5xl:items-start @5xl:gap-6 gap-5">
          <aside className="@5xl:flex hidden flex-col gap-4">
            <SeatCard player={playerX} variant="rail" {...seatProps} />
            {!isPast ? (
              <Spectators count={specCount} watchers={watchers} />
            ) : null}
          </aside>

          <main className="flex flex-col items-center gap-5">
            <div className="flex @5xl:hidden w-full items-stretch gap-3">
              <SeatCard player={playerX} variant="strip" {...seatProps} />
              <SeatCard player={playerO} variant="strip" {...seatProps} />
            </div>

            <TurnBanner
              active={active}
              currentTurn={state.currentTurn}
              isMyTurn={canMove}
              hasRole={myRole !== null}
              outcome={winnerLabel}
            />

            <div className="relative">
              <TttBoard
                board={state.board}
                myRole={myRole}
                canMove={canMove}
                active={active}
                glow={boardGlow}
                winningLine={winningLine}
                winMark={winMark}
                winAnimate={winState.animate}
                onPlay={makeMove}
                onHoverCell={audio.playHover}
              />
              <FloatingReactions items={reactions} />
            </div>

            {!isPast && !userId ? (
              <p className="max-w-md rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm text-warning-foreground">
                Sign in to take a seat. Open this link signed in as the second
                player to fill the match.
              </p>
            ) : null}

            {isPast ? (
              <>
                <ReplayToolbar
                  step={replayShown}
                  maxStep={sortedLen}
                  isPlaying={replayPlaying}
                  onFirst={goFirst}
                  onPrev={goPrev}
                  onTogglePlay={toggleReplayPlay}
                  onNext={goNext}
                  onLast={goLast}
                />
                <p className="text-muted-foreground text-xs">
                  Position after {replayShown} of {sortedLen} moves
                </p>
                {summary ? <MatchSummary stats={summary} /> : null}
              </>
            ) : null}
          </main>

          <aside className="@5xl:flex hidden flex-col gap-5">
            <SeatCard player={playerO} variant="rail" {...seatProps} />
            <MoveLog entries={logEntries} />
            {!isPast ? (
              <ReactionsBar onReact={spawnReaction} disabled={!isLive} />
            ) : null}
          </aside>
        </div>

        <div className="mt-5 flex @5xl:hidden flex-col gap-5">
          {!isPast ? (
            <Spectators count={specCount} watchers={watchers} />
          ) : null}
          <MoveLog entries={logEntries} />
          {!isPast ? (
            <ReactionsBar onReact={spawnReaction} disabled={!isLive} />
          ) : null}
        </div>
      </div>
    </LazyMotion>
  );
}
