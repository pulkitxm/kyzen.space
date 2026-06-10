"use client";

import {
  type AvatarConfig,
  type Cell,
  isGameLive,
  isGameOver,
  type Mark,
  type TicTacToeState as TicState,
} from "@gamelobby/shared/types";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGameAudio } from "../../audio/use-game-audio";
import { PiecePop } from "../../stage/feedback";
import { GameStage } from "../../stage/game-stage";
import { PlayerDock } from "../../stage/player-dock";
import { ReplayDock } from "../../stage/replay-dock";
import { TurnBanner, type TurnBannerTone } from "../../stage/turn-banner";
import type { GameClientProps } from "../../types";
import { TttMark, TttMarkDefs } from "./marks";
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

const CELL_KEYS = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"] as const;

const REPLAY_MS = 850;

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

  const isLive = isGameLive(game.status);

  const isPast = isGameOver(game.status);

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

  const myRole = game.players.find((p) => p.userId === userId)?.role ?? null;
  const canMove =
    Boolean(userId) &&
    game.status === "active" &&
    myRole !== null &&
    liveState.currentTurn === myRole;

  const initialFilledRef = useRef<ReadonlySet<number>>(
    new Set(
      ((initialGame.gameState as TicState | undefined)?.board ?? [])
        .map((cell, idx) => (cell ? idx : -1))
        .filter((idx) => idx >= 0),
    ),
  );
  const replayTouchedRef = useRef(false);

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

  const opponent = game.players.find((p) => p.userId !== userId) ?? null;

  let bannerLabel: string | null = null;
  let bannerTone: TurnBannerTone = "waiting";
  if (isPast) {
    if (game.winner === "draw") {
      bannerLabel = "It's a draw";
      bannerTone = "result";
    } else if (game.winner) {
      const name =
        game.players.find((p) => p.userId === game.winner)?.username ??
        game.winner;
      bannerLabel = game.winner === userId ? "You won" : `${name} won`;
      bannerTone = "result";
    }
  } else if (userId) {
    if (game.status === "waiting") {
      bannerLabel = "Waiting for an opponent…";
    } else if (canMove) {
      bannerLabel = "Your move";
      bannerTone = "self";
    } else if (myRole) {
      bannerLabel = opponent ? `Waiting for ${opponent.username}…` : "Waiting…";
    } else {
      bannerLabel = "Spectating";
    }
  }

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
    const wasLive = isGameLive(prevStatus);
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
    replayTouchedRef.current = true;
    setReplayPlaying(false);
    setReplayStep(0);
  }, []);

  const goPrev = useCallback(() => {
    replayTouchedRef.current = true;
    setReplayPlaying(false);
    setReplayStep((s) => {
      const cur = Math.min(s, sortedLen);
      return Math.max(0, cur - 1);
    });
  }, [sortedLen]);

  const goNext = useCallback(() => {
    replayTouchedRef.current = true;
    setReplayPlaying(false);
    const cur = Math.min(replayStepRef.current, sortedLen);
    if (cur >= sortedLen) return;
    audio.playTouch();
    setReplayStep(cur + 1);
  }, [sortedLen, audio]);

  const goLast = useCallback(() => {
    replayTouchedRef.current = true;
    setReplayPlaying(false);
    setReplayStep(sortedLen);
  }, [sortedLen]);

  const toggleReplayPlay = useCallback(() => {
    replayTouchedRef.current = true;
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

  const board = (
    <div className="relative grid w-fit grid-cols-3 gap-3">
      {CELL_KEYS.map((cellKey, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        const mark = state.board[idx];
        const playable =
          !isPast && canMove && mark === null && game.status === "active";
        const ghostMark = playable ? (myRole as Mark) : null;
        const popsIn =
          !initialFilledRef.current.has(idx) ||
          (isPast && replayTouchedRef.current);
        return (
          <button
            key={cellKey}
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
              <PiecePop
                animate={popsIn}
                className="flex size-16 items-center justify-center sm:size-20"
              >
                <TttMark mark={mark} className="size-full" />
              </PiecePop>
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
  );

  return (
    <GameStage
      dock={
        <PlayerDock
          players={game.players}
          activeRole={game.status === "active" ? state.currentTurn : null}
          myUserId={userId}
          onViewProfile={onViewProfile}
          renderRoleBadge={(role) =>
            role === "X" || role === "O" ? (
              <TttMark mark={role} className="size-4 shrink-0" />
            ) : null
          }
        />
      }
      status={<TurnBanner label={bannerLabel} tone={bannerTone} />}
      connection={
        isPast || !userId
          ? undefined
          : { show: true, online: Boolean(liveSocketKey) && connected }
      }
      notice={
        !isPast && !userId ? (
          <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
            Sign in to join this table and play. Open the same link while signed
            in as the second player to fill the match.
          </p>
        ) : null
      }
      error={error}
      footer={
        isPast ? (
          <ReplayDock
            step={Math.min(replayStep, sortedLen)}
            maxStep={sortedLen}
            isPlaying={replayPlaying}
            onFirst={goFirst}
            onPrev={goPrev}
            onTogglePlay={toggleReplayPlay}
            onNext={goNext}
            onLast={goLast}
          />
        ) : (
          <p className="mt-6 text-muted-foreground text-xs">
            Moves logged: {moves.length}
          </p>
        )
      }
    >
      <TttMarkDefs />
      {board}
    </GameStage>
  );
}
