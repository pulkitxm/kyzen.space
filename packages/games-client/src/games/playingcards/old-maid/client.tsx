"use client";

import type {
  OldMaidCard,
  OldMaidRole,
  OldMaidState,
} from "@gamelobby/shared/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaRegCircleQuestion, FaShuffle, FaUserCheck } from "react-icons/fa6";
import type { GameClientProps } from "../../../types";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  gameState: OldMaidState;
};

type MoveJson = Record<string, unknown>;

function emptyState(): OldMaidState {
  return {
    activeRoles: ["P1", "P2"],
    currentTurn: "P1",
    deckSeed: "loading",
    discardedPairs: [],
    hands: { P1: [], P2: [] },
    lastDraw: null,
    loserRole: null,
    winnerRoles: [],
  };
}

function isOldMaidRole(role: string | null | undefined): role is OldMaidRole {
  return role === "P1" || role === "P2";
}

function roleName(
  players: GameJson["players"],
  role: OldMaidRole | null | undefined,
): string {
  if (!role) return "Player";
  return players.find((player) => player.role === role)?.username ?? role;
}

function opponentRole(role: OldMaidRole | null): OldMaidRole | null {
  if (role === "P1") return "P2";
  if (role === "P2") return "P1";
  return null;
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

function CardFace({ card }: { card: OldMaidCard }) {
  const isJoker = card.rank === "JOKER";
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      className={`flex h-28 w-20 flex-col items-center justify-between rounded-lg border bg-card p-2 shadow-sm ${
        isJoker
          ? "border-warning/60 text-warning-foreground"
          : "border-border text-card-foreground"
      }`}
    >
      <span
        className={`self-start font-semibold text-sm ${red ? "text-danger" : ""}`}
      >
        {card.rank}
      </span>
      <span className={`font-semibold text-lg ${red ? "text-danger" : ""}`}>
        {isJoker ? "Old Maid" : card.suit}
      </span>
      <span
        className={`self-end font-semibold text-sm ${red ? "text-danger" : ""}`}
      >
        {card.rank}
      </span>
    </div>
  );
}

function CardBack({
  index,
  disabled,
  onPick,
}: {
  index: number;
  disabled: boolean;
  onPick: (index: number) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(index)}
      className="flex h-28 w-20 flex-col items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-primary outline-none transition hover:-translate-y-1 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0"
      title="Draw this card"
    >
      <FaRegCircleQuestion size={26} aria-hidden="true" />
      <span className="text-xs">Pick</span>
    </button>
  );
}

export function OldMaidGameClient({
  gameId,
  userId,
  socket,
  connected,
  initialGame,
  initialMoves,
}: GameClientProps) {
  const [game, setGame] = useState<GameJson>({
    ...(initialGame as GameJson),
    gameState:
      (initialGame.gameState as OldMaidState | undefined) ?? emptyState(),
  });
  const [moves, setMoves] = useState<MoveJson[]>(initialMoves);
  const [error, setError] = useState<string | null>(null);

  const isLive = game.status === "waiting" || game.status === "active";
  const state = game.gameState ?? emptyState();
  const myRoleRaw = game.players.find(
    (player) => player.userId === userId,
  )?.role;
  const myRole = isOldMaidRole(myRoleRaw) ? myRoleRaw : null;
  const otherRole = opponentRole(myRole);
  const myHand = myRole ? state.hands[myRole] : [];
  const otherHand = otherRole ? state.hands[otherRole] : [];
  const canMove =
    Boolean(userId) &&
    game.status === "active" &&
    myRole !== null &&
    state.currentTurn === myRole &&
    !state.loserRole;

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
    const onGameState = (payload: { game: GameJson; moves: MoveJson[] }) => {
      setGame(payload.game);
      setMoves(payload.moves);
    };
    const onMoveMade = (payload: { gameState: OldMaidState }) => {
      setGame((current) => ({ ...current, gameState: payload.gameState }));
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

  const pickCard = useCallback(
    (cardIndex: number) => {
      if (!userId || !canMove || !socket?.connected) return;
      socket.emit("make_move", {
        gameId,
        moveData: { cardIndex },
      });
    },
    [canMove, gameId, socket, userId],
  );

  const resultText = state.loserRole
    ? `${roleName(game.players, state.loserRole)} is the Old Maid`
    : game.status === "active"
      ? `${roleName(game.players, state.currentTurn)} draws next`
      : "Waiting for the table";

  return (
    <div className="mt-8 max-w-5xl">
      {!userId ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Sign in to join this table and play. Open the same link while signed
          in as the second player to fill the match.
        </p>
      ) : isLive ? (
        <div className="mb-4 flex items-center gap-3">
          <StatusDot online={Boolean(liveSocketKey) && connected} />
          <span className="text-muted-foreground text-sm">{resultText}</span>
        </div>
      ) : (
        <p className="mb-4 font-medium text-primary text-sm">{resultText}</p>
      )}

      {error ? <p className="mb-4 text-danger text-sm">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-card-foreground">
            <FaShuffle size={18} aria-hidden="true" />
            <h2 className="font-semibold text-base">
              {roleName(game.players, otherRole)} hand
            </h2>
            <span className="text-muted-foreground text-sm">
              {otherHand.length} cards
            </span>
          </div>
          <div className="flex min-h-32 flex-wrap gap-3">
            {otherHand.length > 0 ? (
              otherHand.map((card, index) => (
                <CardBack
                  key={card.id}
                  index={index}
                  disabled={!canMove}
                  onPick={pickCard}
                />
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No cards to draw.</p>
            )}
          </div>

          <div className="mt-8 mb-3 flex items-center gap-2 text-card-foreground">
            <FaUserCheck size={18} aria-hidden="true" />
            <h2 className="font-semibold text-base">Your hand</h2>
            <span className="text-muted-foreground text-sm">
              {myHand.length} cards
            </span>
          </div>
          <div className="flex min-h-32 flex-wrap gap-3">
            {myHand.length > 0 ? (
              myHand.map((card) => <CardFace key={card.id} card={card} />)
            ) : (
              <p className="text-muted-foreground text-sm">
                Your hand is empty.
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-border bg-surface-raised p-4">
          <h2 className="font-semibold text-base text-card-foreground">
            Discards
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {state.discardedPairs.length} pairs removed
          </p>
          <div className="mt-4 space-y-2">
            {state.discardedPairs.slice(-6).map((pair) => (
              <div
                key={`${pair.byRole}-${pair.rank}-${pair.phase}-${pair.cards[0].id}-${pair.cards[1].id}`}
                className="flex items-center justify-between rounded-md bg-surface-overlay px-3 py-2 text-sm"
              >
                <span>{pair.rank} pair</span>
                <span className="text-muted-foreground">
                  {roleName(game.players, pair.byRole)}
                </span>
              </div>
            ))}
          </div>
          {state.lastDraw ? (
            <p className="mt-4 text-muted-foreground text-sm">
              Last draw: {roleName(game.players, state.lastDraw.actorRole)} from{" "}
              {roleName(game.players, state.lastDraw.fromRole)}
              {state.lastDraw.matchedRank
                ? `, discarded ${state.lastDraw.matchedRank}s`
                : ""}
            </p>
          ) : null}
          <p className="mt-4 text-muted-foreground text-xs">
            Moves logged: {moves.length}
          </p>
        </aside>
      </div>
    </div>
  );
}
