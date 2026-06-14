"use client";

import {
  coordKey,
  generateRandomFleet,
  sunkShips,
  validateFleet,
} from "@kyzen/games-core";
import {
  SEA_BATTLE_BOARD_SIZE,
  SEA_BATTLE_FLEET,
} from "@kyzen/shared/constants";
import {
  isGameLive,
  isGameOver,
  type SeaBattleShip,
  type SeaBattleShot,
  type SeaBattleState,
} from "@kyzen/shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowsRotate, FaCheck, FaShuffle } from "react-icons/fa6";
import { useGameAudio } from "../../audio/use-game-audio";
import type { GameClientProps } from "../../types";

type Role = "A" | "B";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: {
    userId: string;
    username: string;
    role: string;
    avatar?: unknown;
  }[];
  gameState: SeaBattleState;
  turnDeadline?: number | null;
};

const SIZE = SEA_BATTLE_BOARD_SIZE;
const ROWS = Array.from({ length: SIZE }, (_, i) => i);
const COLS = Array.from({ length: SIZE }, (_, i) => i);

function emptyState(): SeaBattleState {
  return {
    phase: "placement",
    fleets: { A: [], B: [] },
    shots: { A: [], B: [] },
    ready: { A: false, B: false },
    currentTurn: "A",
  };
}

function shipKeys(ships: SeaBattleShip[]): Set<string> {
  const keys = new Set<string>();
  for (const ship of ships) {
    for (const cell of ship.cells) keys.add(coordKey(cell));
  }
  return keys;
}

function shotMap(shots: SeaBattleShot[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const shot of shots) map.set(`${shot.row},${shot.col}`, shot.hit);
  return map;
}

function ShipGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-full"
      role="presentation"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
      <circle cx="12" cy="12" r="3.5" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

function HitGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-full"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
    </svg>
  );
}

function MissGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-full"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function WaterGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-full"
      role="presentation"
      aria-hidden="true"
    >
      <path
        d="M3 9 Q7 6 12 9 T21 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M3 15 Q7 12 12 15 T21 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

function TurnTimer({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  if (deadline == null) return null;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className="rounded-full bg-surface-overlay px-2 py-0.5 font-mono text-xs tabular-nums">
      {remaining}s
    </span>
  );
}

type Cell = { row: number; col: number };

function cellsForShip(bow: Cell, length: number, horizontal: boolean): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < length; i++) {
    cells.push({
      row: horizontal ? bow.row : bow.row + i,
      col: horizontal ? bow.col + i : bow.col,
    });
  }
  return cells;
}

export function SeaBattleGameClient({
  gameId,
  userId,
  socket,
  connected,
  initialGame,
}: GameClientProps) {
  const [game, setGame] = useState<GameJson>(initialGame as GameJson);
  const [error, setError] = useState<string | null>(null);
  const audio = useGameAudio();

  const myRole = useMemo<Role | null>(() => {
    const p = game.players.find((x) => x.userId === userId);
    return p?.role === "A" || p?.role === "B" ? p.role : null;
  }, [game.players, userId]);

  const isLive = isGameLive(game.status);
  const isOver = isGameOver(game.status);

  const liveSocketKey = useMemo(() => {
    if (!userId || !isLive) return null;
    return { gameId, userId };
  }, [gameId, userId, isLive]);

  useEffect(() => {
    if (!socket || !liveSocketKey) return;
    const { gameId: gid } = liveSocketKey;

    const onConnect = () => {
      setError(null);
      socket.emit("join_room", { gameId: gid });
    };
    const onGameState = (payload: { game: GameJson }) => {
      setGame(payload.game);
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

  const state = game.gameState ?? emptyState();

  const myReady = myRole ? state.ready[myRole] : false;
  const oppRole: Role | null = myRole ? (myRole === "A" ? "B" : "A") : null;

  const [pendingShips, setPendingShips] = useState<SeaBattleShip[]>([]);
  const [horizontal, setHorizontal] = useState(true);
  const placedCount = pendingShips.length;
  const nextSpec = SEA_BATTLE_FLEET[placedCount];
  const fleetValid = validateFleet(pendingShips).ok;

  const randomize = useCallback(() => {
    setPendingShips(generateRandomFleet());
    audio.playTouch();
  }, [audio]);

  const clearPending = useCallback(() => {
    setPendingShips([]);
  }, []);

  const placementKeys = useMemo(() => shipKeys(pendingShips), [pendingShips]);

  const tryPlaceAt = useCallback(
    (cell: Cell) => {
      const hitIndex = pendingShips.findIndex((ship) =>
        ship.cells.some((c) => c.row === cell.row && c.col === cell.col),
      );
      if (hitIndex >= 0) {
        setPendingShips((prev) => prev.filter((_, i) => i !== hitIndex));
        return;
      }
      if (!nextSpec) return;
      const cells = cellsForShip(cell, nextSpec.length, horizontal);
      const outOfBounds = cells.some(
        (c) => c.row < 0 || c.row >= SIZE || c.col < 0 || c.col >= SIZE,
      );
      if (outOfBounds) return;
      const overlap = cells.some((c) => placementKeys.has(coordKey(c)));
      if (overlap) return;
      setPendingShips((prev) => [...prev, { cells }]);
      audio.playTouch();
    },
    [pendingShips, nextSpec, horizontal, placementKeys, audio],
  );

  const submitPlacement = useCallback(() => {
    if (!socket?.connected || !fleetValid) return;
    socket.emit("make_move", {
      gameId,
      moveData: { kind: "place", ships: pendingShips },
    });
  }, [socket, fleetValid, gameId, pendingShips]);

  const canFire =
    Boolean(userId) &&
    game.status === "active" &&
    state.phase === "battle" &&
    myRole !== null &&
    state.currentTurn === myRole;

  const fireAt = useCallback(
    (row: number, col: number) => {
      if (!canFire || !socket?.connected) return;
      audio.playTouch();
      socket.emit("make_move", {
        gameId,
        moveData: { kind: "fire", row, col },
      });
    },
    [canFire, socket, gameId, audio],
  );

  const prevStatusRef = useRef(initialGame.status);
  const endSoundPlayedRef = useRef(false);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = game.status;
    if (endSoundPlayedRef.current) return;
    if (isGameLive(prevStatus) && game.status === "completed") {
      endSoundPlayedRef.current = true;
      audio.playWin();
    }
  }, [game.status, audio]);

  const myShots = oppRole ? state.shots[oppRole] : [];
  const incomingShots = myRole ? state.shots[myRole] : [];
  const incomingCount = incomingShots.length;
  const prevIncomingRef = useRef(incomingCount);
  useEffect(() => {
    const prev = prevIncomingRef.current;
    prevIncomingRef.current = incomingCount;
    if (isOver) return;
    if (incomingCount > prev) audio.playTouch();
  }, [incomingCount, isOver, audio]);

  const winnerLabel = game.winner
    ? `Winner: ${
        game.players.find((p) => p.userId === game.winner)?.username ??
        game.winner
      }`
    : null;

  return (
    <div className="mt-8">
      {error ? <p className="mb-4 text-danger text-sm">{error}</p> : null}

      {!userId ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Sign in as both captains (open this link in two sessions) to play.
        </p>
      ) : null}

      {winnerLabel ? (
        <p className="mb-4 font-medium text-primary text-sm">{winnerLabel}</p>
      ) : null}

      {state.phase === "placement" && !isOver ? (
        <PlacementView
          state={state}
          myReady={myReady}
          oppRole={oppRole}
          pendingShips={pendingShips}
          placementKeys={placementKeys}
          horizontal={horizontal}
          nextSpec={nextSpec ?? null}
          placedCount={placedCount}
          fleetValid={fleetValid}
          connected={connected}
          turnDeadline={game.turnDeadline ?? null}
          onCellClick={tryPlaceAt}
          onRandomize={randomize}
          onClear={clearPending}
          onRotate={() => setHorizontal((h) => !h)}
          onReady={submitPlacement}
        />
      ) : (
        <BattleView
          state={state}
          myRole={myRole}
          oppRole={oppRole}
          myShots={myShots}
          incomingShots={incomingShots}
          canFire={canFire}
          isOver={isOver}
          turnDeadline={game.turnDeadline ?? null}
          onFire={fireAt}
          onHoverPlayable={() => audio.playHover()}
        />
      )}
    </div>
  );
}

function PlacementView({
  state,
  myReady,
  oppRole,
  pendingShips,
  placementKeys,
  horizontal,
  nextSpec,
  placedCount,
  fleetValid,
  connected,
  turnDeadline,
  onCellClick,
  onRandomize,
  onClear,
  onRotate,
  onReady,
}: {
  state: SeaBattleState;
  myReady: boolean;
  oppRole: Role | null;
  pendingShips: SeaBattleShip[];
  placementKeys: Set<string>;
  horizontal: boolean;
  nextSpec: { name: string; length: number } | null;
  placedCount: number;
  fleetValid: boolean;
  connected: boolean;
  turnDeadline: number | null;
  onCellClick: (cell: Cell) => void;
  onRandomize: () => void;
  onClear: () => void;
  onRotate: () => void;
  onReady: () => void;
}) {
  const oppReady = oppRole ? state.ready[oppRole] : false;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-card-foreground text-lg">
          {myReady ? "Fleet locked in" : "Place your fleet"}
        </h2>
        <TurnTimer deadline={turnDeadline} />
        <span className="text-muted-foreground text-xs">
          {connected ? "Connected" : "Reconnecting..."}
        </span>
      </div>

      {myReady ? (
        <p className="rounded-lg border border-border bg-surface-overlay/50 px-3 py-2 text-card-foreground text-sm">
          {oppReady
            ? "Both fleets are ready. Starting battle..."
            : "Waiting for the opponent to finish placing their fleet."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRandomize}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-card-foreground text-sm shadow-sm transition hover:bg-surface-overlay"
            >
              <FaShuffle size={16} aria-hidden="true" /> Randomize
            </button>
            <button
              type="button"
              onClick={onRotate}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-card-foreground text-sm shadow-sm transition hover:bg-surface-overlay"
            >
              <FaArrowsRotate size={16} aria-hidden="true" />{" "}
              {horizontal ? "Horizontal" : "Vertical"}
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={pendingShips.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-3 text-card-foreground text-sm shadow-sm transition hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onReady}
              disabled={!fleetValid}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground text-sm shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaCheck size={16} aria-hidden="true" /> Ready
            </button>
          </div>

          <p className="text-muted-foreground text-sm">
            {nextSpec
              ? `Next: place your ${nextSpec.name} (${nextSpec.length} cells). Click a cell to drop the bow; click a placed ship to remove it.`
              : `All ${placedCount} ships placed. Press Ready to lock in.`}
          </p>
        </>
      )}

      <Board
        ariaLabel="Your fleet board"
        renderCell={(row, col) => {
          const key = `${row},${col}`;
          const occupied = placementKeys.has(key);
          return {
            tone: occupied
              ? "bg-primary/80 text-primary-foreground"
              : "bg-surface-raised text-muted-foreground/40",
            content: occupied ? <ShipGlyph /> : <WaterGlyph />,
            playable: !myReady,
          };
        }}
        onCellClick={
          myReady ? undefined : (row, col) => onCellClick({ row, col })
        }
      />
    </div>
  );
}

function BattleView({
  state,
  myRole,
  oppRole,
  myShots,
  incomingShots,
  canFire,
  isOver,
  turnDeadline,
  onFire,
  onHoverPlayable,
}: {
  state: SeaBattleState;
  myRole: Role | null;
  oppRole: Role | null;
  myShots: SeaBattleShot[];
  incomingShots: SeaBattleShot[];
  canFire: boolean;
  isOver: boolean;
  turnDeadline: number | null;
  onFire: (row: number, col: number) => void;
  onHoverPlayable: () => void;
}) {
  const myFleetKeys = useMemo(
    () => shipKeys(myRole ? state.fleets[myRole] : []),
    [state, myRole],
  );
  const incomingMap = useMemo(() => shotMap(incomingShots), [incomingShots]);
  const myShotMap = useMemo(() => shotMap(myShots), [myShots]);

  const sunkOppKeys = useMemo(
    () => shipKeys(sunkShips(oppRole ? state.fleets[oppRole] : [], myShots)),
    [state, oppRole, myShots],
  );
  const oppFleetKeys = useMemo(
    () => shipKeys(oppRole ? state.fleets[oppRole] : []),
    [state, oppRole],
  );

  const turnLabel = isOver
    ? "Game over"
    : canFire
      ? "Your turn - fire at the enemy grid"
      : "Opponent is taking aim...";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-card-foreground text-lg">
          {turnLabel}
        </h2>
        <TurnTimer deadline={turnDeadline} />
      </div>

      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-card-foreground text-sm">
            Tracking grid (your shots)
          </h3>
          <Board
            ariaLabel="Enemy tracking grid"
            renderCell={(row, col) => {
              const key = `${row},${col}`;
              const fired = myShotMap.has(key);
              const wasHit = myShotMap.get(key) === true;
              const sunk = sunkOppKeys.has(key);
              const revealedShip = isOver && oppFleetKeys.has(key);
              const playable = canFire && !fired && !isOver;
              if (sunk) {
                return {
                  tone: "bg-danger text-danger-foreground",
                  content: <HitGlyph />,
                  playable,
                };
              }
              if (wasHit) {
                return {
                  tone: "bg-danger/80 text-danger-foreground",
                  content: <HitGlyph />,
                  playable,
                };
              }
              if (fired) {
                return {
                  tone: "bg-surface-overlay text-muted-foreground",
                  content: <MissGlyph />,
                  playable,
                };
              }
              if (revealedShip) {
                return {
                  tone: "bg-warning/40 text-warning-foreground",
                  content: <ShipGlyph />,
                  playable,
                };
              }
              return {
                tone: "bg-surface-raised text-primary/30",
                content: <WaterGlyph />,
                playable,
              };
            }}
            onCellClick={canFire ? onFire : undefined}
            onCellHover={(row, col) => {
              if (canFire && !myShotMap.has(`${row},${col}`)) onHoverPlayable();
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-card-foreground text-sm">
            Your fleet (incoming fire)
          </h3>
          <Board
            ariaLabel="Your fleet grid"
            renderCell={(row, col) => {
              const key = `${row},${col}`;
              const ship = myFleetKeys.has(key);
              const fired = incomingMap.has(key);
              const wasHit = incomingMap.get(key) === true;
              if (ship && wasHit) {
                return {
                  tone: "bg-danger text-danger-foreground",
                  content: <HitGlyph />,
                  playable: false,
                };
              }
              if (ship) {
                return {
                  tone: "bg-primary/80 text-primary-foreground",
                  content: <ShipGlyph />,
                  playable: false,
                };
              }
              if (fired) {
                return {
                  tone: "bg-surface-overlay text-muted-foreground",
                  content: <MissGlyph />,
                  playable: false,
                };
              }
              return {
                tone: "bg-surface-raised text-primary/30",
                content: <WaterGlyph />,
                playable: false,
              };
            }}
          />
        </div>
      </div>
    </div>
  );
}

type CellRender = {
  tone: string;
  content: React.ReactNode;
  playable: boolean;
};

function Board({
  ariaLabel,
  renderCell,
  onCellClick,
  onCellHover,
}: {
  ariaLabel: string;
  renderCell: (row: number, col: number) => CellRender;
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="grid w-fit grid-cols-10 gap-0.5 rounded-lg border border-border bg-surface-overlay/40 p-1.5"
    >
      {ROWS.map((row) =>
        COLS.map((col) => {
          const cell = renderCell(row, col);
          const interactive = Boolean(onCellClick) && cell.playable;
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              disabled={!interactive}
              aria-label={`Row ${row + 1}, column ${col + 1}`}
              onMouseEnter={() => onCellHover?.(row, col)}
              onClick={() => {
                if (interactive) onCellClick?.(row, col);
              }}
              className={`flex aspect-square size-7 items-center justify-center rounded-sm p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring sm:size-8 ${cell.tone} ${
                interactive
                  ? "cursor-pointer hover:brightness-110"
                  : "cursor-default"
              }`}
            >
              {cell.content}
            </button>
          );
        }),
      )}
    </section>
  );
}
