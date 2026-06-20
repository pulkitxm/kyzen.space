"use client";

import type {
  GamePlayer,
  MonopolyMove,
  MonopolyState,
  Tile,
} from "@kyzen/shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function StatusDot({ online }: { online: boolean }) {
  const tone = online ? "bg-success" : "bg-danger";
  return (
    <output
      className="relative inline-flex size-3 items-center justify-center"
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
    >
      <span
        className={`absolute inline-flex size-3 animate-ping rounded-full opacity-70 ${tone}`}
      />
      <span className={`relative inline-flex size-2.5 rounded-full ${tone}`} />
    </output>
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
  const [_moves, setMoves] = useState<MoveJson[]>(initialMoves as MoveJson[]);
  const [error, setError] = useState<string | null>(null);

  const isLive = game.status === "waiting" || game.status === "active";
  const isPast = game.status === "completed" || game.status === "abandoned";

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
    turnSecondsLeft,
  } = useGamePhase(liveState, makeMove, isMyTurn, gameId);

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

  const state = displayedState;

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
            turnSecondsLeft={turnSecondsLeft}
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

      {}
    </div>
  );
}
