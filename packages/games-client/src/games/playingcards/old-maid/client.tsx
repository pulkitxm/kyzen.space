"use client";

import { OLD_MAID } from "@gamelobby/shared/constants";
import type {
  OldMaidCard,
  OldMaidDiscardedPair,
  OldMaidRole,
  OldMaidState,
  OldMaidSuit,
  Rank,
  Suit,
} from "@gamelobby/shared/types";
import type { CSSProperties, ReactNode, Ref } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FaLayerGroup, FaShuffle, FaUserCheck } from "react-icons/fa6";
import {
  CardBack,
  Joker,
  PlayingCard,
} from "../../../playing-cards/playing-card";
import type { GameClientProps } from "../../../types";
import {
  centerPoint,
  clearHandTransforms,
  dedupeCards,
  type FlightPoint,
  measurePoint,
  runArcFlight,
  runDiscardFlight,
  runHandCollapse,
  runHandRiffle,
  runHandSpreadToFan,
  snapHandToStack,
} from "./animations";

type GameJson = {
  id: string;
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  gameState: OldMaidState;
};

type MoveJson = Record<string, unknown>;

type PickFlight = {
  cardIndex: number;
  from: FlightPoint;
  to: FlightPoint | null;
  phase: "prep" | "fly" | "landed";
};

type DiscardFlight = {
  cards: [OldMaidCard, OldMaidCard];
  flights: [PickFlight, PickFlight];
  phase: "prep" | "fly" | "landed";
};

type PlayerStatLine = { played: number; won: number };

const API_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
    : "http://localhost:4000";

type ProfilePublicResponse = {
  profile?: { stats?: Record<string, { played?: number; won?: number }> };
};

async function fetchOldMaidPlayerStats(
  players: GameJson["players"],
): Promise<Record<string, PlayerStatLine>> {
  const next: Record<string, PlayerStatLine> = {};
  await Promise.all(
    players.map(async (player) => {
      try {
        const res = await fetch(
          `${API_URL}/api/profiles/${encodeURIComponent(player.username)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          next[player.userId] = { played: 0, won: 0 };
          return;
        }
        const body = (await res.json()) as ProfilePublicResponse;
        const row = body.profile?.stats?.[OLD_MAID];
        next[player.userId] = {
          played: row?.played ?? 0,
          won: row?.won ?? 0,
        };
      } catch {
        next[player.userId] = { played: 0, won: 0 };
      }
    }),
  );
  return next;
}

const CARD_BASE =
  "old-maid-card old-maid-card-slot old-maid-card-enter relative shrink-0 overflow-hidden rounded-xl drop-shadow-xl transition duration-200 ease-out hover:-translate-y-4 hover:rotate-0 hover:drop-shadow-2xl";
const OPPONENT_CARD_SHELL = `${CARD_BASE} h-36 w-24 sm:h-44 sm:w-28`;
const PLAYER_CARD_SHELL = `${CARD_BASE} h-44 w-32 sm:h-52 sm:w-36`;
const PICK_FLIGHT_MS = 980;
const DISCARD_FLIGHT_MS = 920;

function emptyState(): OldMaidState {
  return {
    activeRoles: ["P1", "P2"],
    currentTurn: "P1",
    deckSeed: "loading",
    discardedPairs: [],
    handOrderPending: null,
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

function oldMaidToSuit(suit: OldMaidSuit): Suit {
  switch (suit) {
    case "S":
      return "spades";
    case "H":
      return "hearts";
    case "D":
      return "diamonds";
    case "C":
      return "clubs";
    case "JOKER":
      return "spades";
  }
}

function fanRotation(index: number, total: number): number {
  const midpoint = (total - 1) / 2;
  return Math.max(-22, Math.min(22, (index - midpoint) * 3.2));
}

function fanLift(index: number, total: number): number {
  const midpoint = (total - 1) / 2;
  return Math.abs(index - midpoint) * -2;
}

function fanStyle(index: number, total: number): CSSProperties {
  const spread = fanRotation(index, total);
  const lift = fanLift(index, total);

  return {
    "--card-rotation": `${spread}deg`,
    "--card-lift": `${lift}px`,
    "--card-delay": `${Math.min(index * 20, 220)}ms`,
  } as CSSProperties;
}

function fanInlineTransform(index: number, total: number): string {
  return `rotate(${fanRotation(index, total)}deg) translateY(${fanLift(index, total)}px)`;
}

function cardTitle(card: OldMaidCard): string {
  if (card.rank === "JOKER") return "Old Maid";
  const suitLabel =
    card.suit === "S"
      ? "Spades"
      : card.suit === "H"
        ? "Hearts"
        : card.suit === "D"
          ? "Diamonds"
          : "Clubs";
  return `${card.rank} of ${suitLabel}`;
}

function sameHandIds(a: OldMaidCard[], b: OldMaidCard[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((card) => card.id));
  return b.every((card) => ids.has(card.id));
}

function handOrderChanged(a: OldMaidCard[], b: OldMaidCard[]): boolean {
  if (!sameHandIds(a, b)) return false;
  return a.some((card, index) => card.id !== b[index]?.id);
}

function fanStackCenter(fan: HTMLElement): { x: number; y: number } {
  const rect = fan.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.bottom - 40 };
}

function fanCardElements(fan: HTMLElement): HTMLElement[] {
  return [
    ...fan.querySelectorAll<HTMLElement>(
      ".old-maid-card-slot:not(.invisible), button.old-maid-card-slot:not(.invisible)",
    ),
  ];
}

function handSlotElements(fan: HTMLElement, hand: OldMaidCard[]): HTMLElement[] {
  const byId = hand
    .map((card) => fan.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`))
    .filter((el): el is HTMLElement => el !== null);
  if (byId.length === hand.length) return byId;
  const backs = [
    ...fan.querySelectorAll<HTMLElement>(
      "button.old-maid-card-slot:not(.invisible)",
    ),
  ];
  if (backs.length === hand.length) return backs;
  return byId;
}

async function spreadHandFromStack(
  fan: HTMLElement,
  hand: OldMaidCard[],
  durationMs: number,
): Promise<void> {
  const slots = handSlotElements(fan, hand);
  if (slots.length === 0) return;
  const stack = fanStackCenter(fan);
  snapHandToStack(slots, stack.x, stack.y);
  const endTransforms = slots.map((_el, index) =>
    fanInlineTransform(index, hand.length),
  );
  await runHandSpreadToFan(slots, endTransforms, durationMs);
  clearHandTransforms(slots);
}

function resetFanAnimationStyles(
  playerFan: HTMLElement | null,
  opponentFan: HTMLElement | null,
): void {
  if (playerFan) clearHandTransforms(fanCardElements(playerFan));
  if (opponentFan) clearHandTransforms(fanCardElements(opponentFan));
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function OldMaidCardArt({
  card,
  className = "h-auto w-full",
}: {
  card: OldMaidCard;
  className?: string;
}) {
  if (card.rank === "JOKER" || card.suit === "JOKER") {
    return <Joker className={className} variant="red" />;
  }
  return (
    <PlayingCard
      className={className}
      rank={card.rank as Rank}
      suit={oldMaidToSuit(card.suit)}
    />
  );
}

const FanHand = forwardRef(function FanHand(
  {
    cardCount,
    className,
    children,
  }: {
    cardCount: number;
    className?: string;
    children: ReactNode;
  },
  ref: Ref<HTMLDivElement>,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;

    const update = () => {
      if (cardCount <= 1) {
        el.style.setProperty("--card-overlap", "0px");
        return;
      }
      const sample = el.querySelector<HTMLElement>(".old-maid-card-slot");
      if (!sample) return;
      const cardW = sample.offsetWidth;
      const available = Math.max(el.clientWidth - 32, cardW);
      const step = (available - cardW) / (cardCount - 1);
      const clampedStep = Math.max(
        cardW * 0.16,
        Math.min(cardW * 0.72, step),
      );
      el.style.setProperty(
        "--card-overlap",
        `${Math.round(cardW - clampedStep)}px`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardCount]);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <div ref={setRef} className={className}>
      {children}
    </div>
  );
});

function FlyingCardOverlay({
  flight,
  durationMs,
  flightKind = "pick",
  shellRef: externalShellRef,
  onComplete,
  children,
}: {
  flight: PickFlight;
  durationMs: number;
  flightKind?: "pick" | "discard";
  shellRef?: Ref<HTMLDivElement>;
  onComplete?: () => void;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef(false);

  const setShellRef = useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node;
      if (typeof externalShellRef === "function") externalShellRef(node);
      else if (externalShellRef) externalShellRef.current = node;
    },
    [externalShellRef],
  );

  useLayoutEffect(() => {
    playedRef.current = false;
  }, [flight.cardIndex, flight.from.cx, flight.from.cy]);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el || !flight.to || flight.phase !== "fly" || playedRef.current) {
      return;
    }
    playedRef.current = true;
    const run =
      flightKind === "discard" ? runDiscardFlight : runArcFlight;
    const animation = run(el, flight.from, flight.to, durationMs, onComplete);
    return () => animation.cancel();
  }, [durationMs, flight, flightKind, onComplete]);

  const { from } = flight;

  return createPortal(
    <div
      ref={setShellRef}
      className="old-maid-flying-card fixed drop-shadow-2xl"
      style={{
        left: from.cx,
        top: from.cy,
        width: from.width,
        height: from.height,
        marginLeft: -from.width / 2,
        marginTop: -from.height / 2,
        transform: `rotate(${from.rotation}deg)`,
      }}
    >
      {children}
    </div>,
    document.body,
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

function CardFace({
  card,
  index,
  total,
  concealed,
}: {
  card: OldMaidCard;
  index: number;
  total: number;
  concealed?: boolean;
}) {
  return (
    <div
      data-card-id={card.id}
      className={`${PLAYER_CARD_SHELL} group ${concealed ? "invisible" : ""}`}
      style={fanStyle(index, total)}
      title={cardTitle(card)}
    >
      <OldMaidCardArt card={card} />
    </div>
  );
}

function DrawCardButton({
  index,
  total,
  disabled,
  hidden,
  onPick,
}: {
  index: number;
  total: number;
  disabled: boolean;
  hidden: boolean;
  onPick: (index: number, source: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => onPick(index, event.currentTarget)}
      className={`${OPPONENT_CARD_SHELL} group outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default disabled:opacity-75 disabled:hover:translate-y-0 disabled:hover:rotate-(--card-rotation) ${
        hidden ? "invisible" : ""
      }`}
      style={fanStyle(index, total)}
      title={disabled ? "Wait for your turn" : "Draw this card"}
    >
      <CardBack className="h-auto w-full" />
      <span className="sr-only">Draw card {index + 1}</span>
    </button>
  );
}

function discardStackOffset(index: number): {
  x: number;
  y: number;
  rotation: number;
} {
  const rotation = ((index * 13) % 21) - 10;
  const x = ((index * 7) % 11) - 5;
  const y = ((index * 5) % 9) - 4;
  return { x, y, rotation };
}

function DiscardPile({ pairs }: { pairs: OldMaidDiscardedPair[] }) {
  const cards = pairs.flatMap((pair) => pair.cards);
  const visible = cards.slice(-16);
  const baseIndex = cards.length - visible.length;

  return (
    <div className="old-maid-discard-pile flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-4">
      {visible.length > 0 ? (
        <div
          className="old-maid-discard-stack"
          aria-label={`${pairs.length} matched pairs discarded`}
        >
          {visible.map((card, index) => {
            const stackIndex = baseIndex + index;
            const { x, y, rotation } = discardStackOffset(stackIndex);
            return (
              <div
                key={card.id}
                className="old-maid-discard-stack-card"
                style={{
                  zIndex: stackIndex,
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg)`,
                }}
                title={cardTitle(card)}
              >
                <OldMaidCardArt card={card} />
              </div>
            );
          })}
          {pairs.length > 0 ? (
            <span className="old-maid-discard-stack-count">
              {pairs.length} pairs
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-white/55">Matched pairs land here</p>
      )}
    </div>
  );
}

function TurnBanner({
  players,
  currentTurn,
  myRole,
  handOrderPending,
}: {
  players: GameJson["players"];
  currentTurn: OldMaidRole;
  myRole: OldMaidRole | null;
  handOrderPending: OldMaidRole | null;
}) {
  const mine = handOrderPending === myRole;
  const picking = !handOrderPending && currentTurn === myRole;
  const tone = mine
    ? "border-amber-300/80 bg-amber-500/20 text-amber-50"
    : picking
      ? "border-emerald-300/80 bg-emerald-500/25 text-emerald-50"
      : "border-white/20 bg-black/30 text-white/85";

  const label = mine
    ? `${roleName(players, myRole)} — shuffle or keep order`
    : `${roleName(players, currentTurn)} is picking a card`;

  return (
    <div
      className={`mb-3 flex items-center justify-center rounded-full border px-5 py-2 font-medium text-sm ${tone}`}
    >
      {label}
    </div>
  );
}

function GameResultPanel({
  game,
  playerStats,
}: {
  game: GameJson;
  playerStats: Record<string, PlayerStatLine>;
}) {
  const loserRole = game.gameState.loserRole;
  const loser = game.players.find((player) => player.role === loserRole);
  const winner = game.players.find((player) => player.userId === game.winner);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-black/55 px-6 py-10 text-center shadow-2xl backdrop-blur-md">
        <p className="font-medium text-amber-200/90 text-xs uppercase tracking-[0.28em]">
          Match over
        </p>
        <h2 className="mt-3 font-bold text-3xl text-white sm:text-4xl">
          {winner ? `${winner.username} wins` : "Game over"}
        </h2>
        {loser ? (
          <p className="mt-3 text-lg text-white/80">
            {loser.username} is the Old Maid
          </p>
        ) : null}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {game.players.map((player) => {
            const line = playerStats[player.userId];
            return (
              <div
                key={player.userId}
                className="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-left"
              >
                <p className="font-semibold text-white">{player.username}</p>
                <p className="mt-1 text-sm text-white/70">
                  {line?.won ?? 0} won · {line?.played ?? 0} played
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
  const [pickFlight, setPickFlight] = useState<PickFlight | null>(null);
  const [discardFlight, setDiscardFlight] = useState<DiscardFlight | null>(
    null,
  );
  const [pendingCardIndex, setPendingCardIndex] = useState<number | null>(null);
  const [pairStaging, setPairStaging] = useState<OldMaidDiscardedPair | null>(
    null,
  );
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [handDisplayOverride, setHandDisplayOverride] = useState<
    Partial<Record<OldMaidRole, OldMaidCard[]>>
  >({});
  const [shufflingRole, setShufflingRole] = useState<OldMaidRole | null>(null);
  const [shuffleSpread, setShuffleSpread] = useState<{
    role: OldMaidRole;
    hand: OldMaidCard[];
  } | null>(null);
  const [pickRevealCard, setPickRevealCard] = useState<OldMaidCard | null>(
    null,
  );
  const [showResult, setShowResult] = useState(
    initialGame.status === "completed",
  );
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerStatLine>
  >({});
  const pickInFlightRef = useRef(false);
  const pickEmittedRef = useRef(false);
  const pickFlightRef = useRef<PickFlight | null>(null);
  const discardFlightRef = useRef<DiscardFlight | null>(null);
  const pendingGameStateRef = useRef<OldMaidState | null>(null);
  const landingSlotRef = useRef<HTMLDivElement | null>(null);
  const playerFanRef = useRef<HTMLDivElement | null>(null);
  const opponentFanRef = useRef<HTMLDivElement | null>(null);
  const discardPileRef = useRef<HTMLDivElement | null>(null);
  const discardedCountRef = useRef(0);
  const preDrawHandRef = useRef<OldMaidCard[]>([]);
  const pickShellRef = useRef<HTMLDivElement | null>(null);
  const landedPickPointRef = useRef<FlightPoint | null>(null);
  const prevGameStateRef = useRef<OldMaidState>(emptyState());
  const shuffleBusyRef = useRef(false);
  const localShufflePrimedRef = useRef(false);
  const pendingShuffleStateRef = useRef<OldMaidState | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  pickFlightRef.current = pickFlight;
  discardFlightRef.current = discardFlight;

  const isLive = game.status === "waiting" || game.status === "active";
  const isPast = game.status === "completed";
  const state = game.gameState ?? emptyState();
  const myRoleRaw = game.players.find(
    (player) => player.userId === userId,
  )?.role;
  const myRole = isOldMaidRole(myRoleRaw) ? myRoleRaw : null;
  const otherRole = opponentRole(myRole);
  const myHand = myRole
    ? (handDisplayOverride[myRole] ?? state.hands[myRole])
    : [];
  const otherHand = otherRole
    ? (handDisplayOverride[otherRole] ?? state.hands[otherRole])
    : [];
  const canDraw =
    Boolean(userId) &&
    game.status === "active" &&
    myRole !== null &&
    state.currentTurn === myRole &&
    !state.loserRole &&
    state.handOrderPending === null;
  const canArrangeHand =
    Boolean(userId) &&
    game.status === "active" &&
    myRole !== null &&
    state.handOrderPending === myRole &&
    !state.loserRole;
  const picking = pendingCardIndex !== null || pickFlight !== null;
  const landingTotal = myHand.length + (picking ? 1 : 0);
  const animating =
    picking ||
    discardFlight !== null ||
    pairStaging !== null ||
    shufflingRole !== null;

  const liveSocketKey = useMemo(() => {
    if (!userId || !isLive) return null;
    return { gameId, userId };
  }, [gameId, userId, isLive]);

  const clearPick = useCallback(() => {
    pickInFlightRef.current = false;
    pickEmittedRef.current = false;
    setPickFlight(null);
    setPendingCardIndex(null);
  }, []);

  const clearDiscardFlight = useCallback(() => {
    setDiscardFlight(null);
  }, []);

  const commitPendingState = useCallback(() => {
    resetFanAnimationStyles(playerFanRef.current, opponentFanRef.current);
    const pending = pendingGameStateRef.current;
    if (pending) {
      setGame((current) => ({ ...current, gameState: pending }));
      pendingGameStateRef.current = null;
      prevGameStateRef.current = pending;
    }
    const shufflePending = pendingShuffleStateRef.current;
    if (shufflePending) {
      setGame((current) => ({ ...current, gameState: shufflePending }));
      pendingShuffleStateRef.current = null;
      prevGameStateRef.current = shufflePending;
    }
    setPairStaging(null);
    setHiddenCardIds(new Set());
    setPickRevealCard(null);
    landedPickPointRef.current = null;
    setHandDisplayOverride({});
    setShuffleSpread(null);
    setShufflingRole(null);
    shuffleBusyRef.current = false;
    localShufflePrimedRef.current = false;
  }, []);

  const runCollapseRiffle = useCallback(
    async (fan: HTMLElement) => {
      const elements = fanCardElements(fan);
      if (elements.length === 0) return;
      const stack = fanStackCenter(fan);
      await runHandCollapse(elements, stack.x, stack.y, 420);
      await runHandRiffle(elements, 360);
    },
    [],
  );

  useEffect(() => {
    discardedCountRef.current = state.discardedPairs.length;
    prevGameStateRef.current = state;
  }, []);

  const playersRef = useRef(game.players);
  playersRef.current = game.players;

  const refreshPlayerStats = useCallback(async () => {
    setPlayerStats(await fetchOldMaidPlayerStats(playersRef.current));
  }, []);

  useEffect(() => {
    if (!isPast) return;
    setShowResult(true);
    void refreshPlayerStats();
  }, [isPast, refreshPlayerStats]);

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
      clearPick();
      clearDiscardFlight();
      commitPendingState();
      prevGameStateRef.current =
        payload.game.gameState ?? emptyState();
      discardedCountRef.current =
        payload.game.gameState?.discardedPairs.length ?? 0;
      if (payload.game.status === "completed") {
        setShowResult(true);
        void refreshPlayerStats();
      }
    };
    const onGameOver = (payload: { winner: string | null }) => {
      setGame((current) => ({
        ...current,
        status: "completed",
        winner: payload.winner,
      }));
      setShowResult(true);
      void refreshPlayerStats();
    };
    const onMoveMade = (payload: { gameState: OldMaidState }) => {
      const prevState = prevGameStateRef.current;
      const prevCount = discardedCountRef.current;
      const nextState = payload.gameState;
      const nextCount = nextState.discardedPairs.length;
      const newPair =
        nextCount > prevCount
          ? nextState.discardedPairs[nextCount - 1]
          : undefined;
      const pendingRole = prevState.handOrderPending;
      const shuffledRole =
        pendingRole &&
        nextState.handOrderPending === null &&
        handOrderChanged(
          prevState.hands[pendingRole],
          nextState.hands[pendingRole],
        )
          ? pendingRole
          : null;

      if (
        newPair &&
        newPair.phase === "draw" &&
        !prefersReducedMotion &&
        myRole
      ) {
        pendingGameStateRef.current = nextState;
        setPairStaging(newPair);
        const drawnCard =
          newPair.cards.find(
            (card) => !preDrawHandRef.current.some((row) => row.id === card.id),
          ) ?? newPair.cards[1];
        if (newPair.byRole === myRole) {
          setPickRevealCard(drawnCard ?? null);
          setGame((current) => ({
            ...current,
            gameState: {
              ...nextState,
              hands: {
                ...nextState.hands,
                [myRole]: dedupeCards([
                  ...nextState.hands[myRole],
                  ...newPair.cards,
                ]),
              },
              discardedPairs: nextState.discardedPairs.slice(0, -1),
            },
          }));
        } else {
          setGame((current) => ({
            ...current,
            gameState: {
              ...nextState,
              discardedPairs: nextState.discardedPairs.slice(0, -1),
            },
          }));
        }
      } else if (shuffledRole && !prefersReducedMotion) {
        pendingShuffleStateRef.current = nextState;
        setShufflingRole(shuffledRole);
        const finalHand = nextState.hands[shuffledRole];
        const primed =
          shuffledRole === myRole && localShufflePrimedRef.current;
        void (async () => {
          const fan =
            shuffledRole === myRole
              ? playerFanRef.current
              : opponentFanRef.current;
          if (!fan) {
            commitPendingState();
            return;
          }
          if (!primed) {
            await runCollapseRiffle(fan);
          }
          setHandDisplayOverride((current) => ({
            ...current,
            [shuffledRole]: finalHand,
          }));
          setShuffleSpread({ role: shuffledRole, hand: finalHand });
        })();
      } else {
        setGame((current) => ({ ...current, gameState: nextState }));
        prevGameStateRef.current = nextState;
        clearPick();
      }

      discardedCountRef.current = nextCount;

      if (
        !(
          newPair &&
          newPair.phase === "draw" &&
          !prefersReducedMotion &&
          myRole
        )
      ) {
        if (!shuffledRole || prefersReducedMotion) {
          clearPick();
        }
      }
    };
    const onGameError = (payload: { message?: string }) => {
      setError(payload.message ?? "Error");
      clearPick();
      clearDiscardFlight();
      commitPendingState();
    };

    socket.on("connect", onConnect);
    socket.on("game_state", onGameState);
    socket.on("game_over", onGameOver);
    socket.on("move_made", onMoveMade);
    socket.on("game_error", onGameError);

    if (socket.connected) socket.emit("join_room", { gameId: gid });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game_state", onGameState);
      socket.off("game_over", onGameOver);
      socket.off("move_made", onMoveMade);
      socket.off("game_error", onGameError);
      clearPick();
      clearDiscardFlight();
      commitPendingState();
      if (socket.connected) socket.emit("leave_room", { gameId: gid });
    };
  }, [
    socket,
    liveSocketKey,
    clearPick,
    clearDiscardFlight,
    commitPendingState,
    prefersReducedMotion,
    myRole,
    runCollapseRiffle,
    refreshPlayerStats,
  ]);

  useLayoutEffect(() => {
    if (!shuffleSpread || prefersReducedMotion) return;

    let cancelled = false;
    let attempts = 0;
    const safetyId = window.setTimeout(() => {
      if (!cancelled) commitPendingState();
    }, 4500);

    const runSpread = () => {
      if (cancelled) return;
      attempts += 1;
      const { role, hand } = shuffleSpread;
      const fan =
        role === myRole ? playerFanRef.current : opponentFanRef.current;
      if (!fan) {
        if (attempts < 60) {
          requestAnimationFrame(runSpread);
          return;
        }
        commitPendingState();
        return;
      }

      const slots = handSlotElements(fan, hand);

      if (slots.length < hand.length) {
        if (attempts < 60) {
          requestAnimationFrame(runSpread);
          return;
        }
        commitPendingState();
        return;
      }

      void spreadHandFromStack(fan, hand, 560).then(() => {
        if (!cancelled) commitPendingState();
      });
    };

    runSpread();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyId);
    };
  }, [
    shuffleSpread,
    commitPendingState,
    myRole,
    prefersReducedMotion,
  ]);

  useLayoutEffect(() => {
    if (!pairStaging || !myRole || discardFlight) return;

    let cancelled = false;

    const measureAndLaunch = () => {
      if (cancelled) return;
      const pile = discardPileRef.current;
      if (!pile) {
        requestAnimationFrame(measureAndLaunch);
        return;
      }

      const actorRole = pairStaging.byRole;
      const fromMyHand = actorRole === myRole;
      const fan = fromMyHand ? playerFanRef.current : opponentFanRef.current;
      if (!fan) {
        requestAnimationFrame(measureAndLaunch);
        return;
      }

      const sample = fan.querySelector<HTMLElement>(".old-maid-card-slot");
      const cardW = sample?.offsetWidth ?? 112;
      const cardH = sample?.offsetHeight ?? 156;
      const miniW = cardW * 0.58;
      const miniH = cardH * 0.58;
      const pileRect = pile.getBoundingClientRect();
      const pileCenter = centerPoint(pileRect, miniW, miniH);
      const pileIndex = state.discardedPairs.length;
      const stackJitter = ((pileIndex * 5) % 9) - 4;

      let fromA: FlightPoint;
      let fromB: FlightPoint;

      if (fromMyHand) {
        const handCards = myHand;
        const preIds = new Set(preDrawHandRef.current.map((card) => card.id));
        const drawnCard =
          pairStaging.cards.find((card) => !preIds.has(card.id)) ??
          pairStaging.cards[1];
        const heldCard =
          pairStaging.cards.find((card) => card.id !== drawnCard?.id) ??
          pairStaging.cards[0];
        const heldEl = fan.querySelector<HTMLElement>(
          `[data-card-id="${heldCard.id}"]`,
        );
        if (!heldEl) {
          requestAnimationFrame(measureAndLaunch);
          return;
        }
        const heldIndex = handCards.findIndex((row) => row.id === heldCard.id);
        fromA = measurePoint(
          heldEl,
          fanRotation(Math.max(heldIndex, 0), handCards.length),
        );
        if (pickShellRef.current) {
          fromB = measurePoint(
            pickShellRef.current,
            fanRotation(Math.max(myHand.length - 1, 0), landingTotal),
          );
        } else if (landedPickPointRef.current) {
          fromB = landedPickPointRef.current;
        } else if (landingSlotRef.current) {
          fromB = measurePoint(
            landingSlotRef.current,
            fanRotation(myHand.length, landingTotal),
          );
        } else {
          requestAnimationFrame(measureAndLaunch);
          return;
        }
      } else {
        const fanRect = fan.getBoundingClientRect();
        const center = centerPoint(fanRect, cardW, cardH);
        fromA = { ...center, cx: center.cx - cardW * 0.22, rotation: -8 };
        fromB = { ...center, cx: center.cx + cardW * 0.22, rotation: 8 };
      }

      setDiscardFlight({
        cards: pairStaging.cards,
        flights: [
          {
            cardIndex: -1,
            from: fromA,
            to: {
              ...pileCenter,
              cx: pileCenter.cx + stackJitter - 5,
              width: miniW,
              height: miniH,
              rotation: discardStackOffset(pileIndex * 2).rotation,
            },
            phase: "prep",
          },
          {
            cardIndex: -1,
            from: fromB,
            to: {
              ...pileCenter,
              cx: pileCenter.cx + stackJitter + 5,
              width: miniW,
              height: miniH,
              rotation: discardStackOffset(pileIndex * 2 + 1).rotation,
            },
            phase: "prep",
          },
        ],
        phase: "prep",
      });
    };

    requestAnimationFrame(() => requestAnimationFrame(measureAndLaunch));

    return () => {
      cancelled = true;
    };
  }, [
    pairStaging,
    myRole,
    discardFlight,
    myHand,
    state.discardedPairs.length,
    landingTotal,
  ]);

  useLayoutEffect(() => {
    if (!discardFlight || discardFlight.phase !== "prep") return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pairStaging) {
          setHiddenCardIds(
            new Set(pairStaging.cards.map((card) => card.id)),
          );
          clearPick();
        }
        setDiscardFlight((current) =>
          current
            ? {
                ...current,
                phase: "fly",
                flights: [
                  { ...current.flights[0], phase: "fly" },
                  { ...current.flights[1], phase: "fly" },
                ],
              }
            : null,
        );
      });
    });
    const fallbackId = window.setTimeout(() => {
      clearDiscardFlight();
      commitPendingState();
    }, DISCARD_FLIGHT_MS + 400);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallbackId);
    };
  }, [discardFlight, clearDiscardFlight, commitPendingState, pairStaging, clearPick]);

  const myHandRef = useRef(myHand);
  myHandRef.current = myHand;

  const emitPick = useCallback(
    (cardIndex: number) => {
      if (pickEmittedRef.current || !socket?.connected) return;
      pickEmittedRef.current = true;
      preDrawHandRef.current = [...myHandRef.current];
      socket.emit("make_move", {
        gameId,
        moveData: { cardIndex },
      });
    },
    [gameId, socket],
  );

  useLayoutEffect(() => {
    if (!pickFlight || pickFlight.phase !== "prep") return;

    if (!pickFlight.to) {
      const slot = landingSlotRef.current;
      if (!slot) return;
      const to = measurePoint(
        slot,
        fanRotation(myHand.length, myHand.length + 1),
      );
      setPickFlight((current) => (current ? { ...current, to } : null));
      return;
    }

    const startFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPickFlight((current) =>
          current?.phase === "prep" ? { ...current, phase: "fly" } : current,
        );
      });
    });
    const fallbackId = window.setTimeout(() => {
      const flight = pickFlightRef.current;
      if (!flight || flight.phase !== "fly") return;
      setPickFlight((current) =>
        current ? { ...current, phase: "landed" } : null,
      );
      pickInFlightRef.current = false;
      emitPick(flight.cardIndex);
    }, PICK_FLIGHT_MS + 140);

    return () => {
      cancelAnimationFrame(startFrame);
      window.clearTimeout(fallbackId);
    };
  }, [pickFlight, myHand.length, emitPick]);

  const handlePickFlightEnd = useCallback(() => {
    const flight = pickFlightRef.current;
    if (!flight || flight.phase !== "fly") return;
    if (pickShellRef.current) {
      landedPickPointRef.current = measurePoint(
        pickShellRef.current,
        flight.to?.rotation ?? flight.from.rotation,
      );
    }
    setPickFlight((current) =>
      current ? { ...current, phase: "landed" } : null,
    );
    pickInFlightRef.current = false;
    emitPick(flight.cardIndex);
  }, [emitPick]);

  const handleDiscardFlightEnd = useCallback(() => {
    const flight = discardFlightRef.current;
    if (!flight || flight.phase !== "fly") return;
    setDiscardFlight((current) =>
      current ? { ...current, phase: "landed" } : null,
    );
    window.setTimeout(() => {
      clearDiscardFlight();
      commitPendingState();
    }, 120);
  }, [clearDiscardFlight, commitPendingState]);

  const emitHandOrder = useCallback(
    (action: "shuffle" | "keepOrder") => {
      if (!canArrangeHand || !socket?.connected) return;
      socket.emit("make_move", {
        gameId,
        moveData: { action },
      });
    },
    [canArrangeHand, gameId, socket],
  );

  const handleShuffle = useCallback(async () => {
    if (!canArrangeHand || !socket?.connected || shuffleBusyRef.current) {
      return;
    }
    if (prefersReducedMotion) {
      emitHandOrder("shuffle");
      return;
    }
    shuffleBusyRef.current = true;
    localShufflePrimedRef.current = true;
    if (myRole) setShufflingRole(myRole);
    const fan = playerFanRef.current;
    if (fan) await runCollapseRiffle(fan);
    socket.emit("make_move", {
      gameId,
      moveData: { action: "shuffle" },
    });
  }, [
    canArrangeHand,
    gameId,
    myRole,
    prefersReducedMotion,
    runCollapseRiffle,
    socket,
  ]);

  const pickCard = useCallback(
    (cardIndex: number, sourceEl: HTMLButtonElement) => {
      if (
        !userId ||
        !canDraw ||
        !socket?.connected ||
        pickInFlightRef.current ||
        pendingCardIndex !== null ||
        discardFlight !== null ||
        pairStaging !== null
      ) {
        return;
      }

      if (prefersReducedMotion) {
        emitPick(cardIndex);
        return;
      }

      pickInFlightRef.current = true;
      setPendingCardIndex(cardIndex);
      setPickFlight({
        cardIndex,
        from: measurePoint(sourceEl, fanRotation(cardIndex, otherHand.length)),
        to: null,
        phase: "prep",
      });
    },
    [
      canDraw,
      discardFlight,
      emitPick,
      otherHand.length,
      pairStaging,
      pendingCardIndex,
      prefersReducedMotion,
      socket,
      userId,
    ],
  );

  const tableContent = (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-white/10 border-b px-4 py-3 text-white/90">
        <div className="flex items-center gap-2">
          <FaShuffle size={18} aria-hidden="true" />
          <h2 className="font-semibold text-base">
            {roleName(game.players, otherRole)}
          </h2>
          <span className="text-sm text-white/60">{otherHand.length} cards</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <FaLayerGroup size={16} aria-hidden="true" />
          <span>{state.discardedPairs.length} pairs discarded</span>
        </div>
      </header>

      <FanHand
        ref={opponentFanRef}
        cardCount={otherHand.length}
        className={`old-maid-fan old-maid-opponent-fan w-full ${shufflingRole === otherRole ? "old-maid-shuffle-active" : ""}`}
      >
        {otherHand.length > 0 ? (
          otherHand.map((card, index) => (
            <DrawCardButton
              key={card.id}
              index={index}
              total={otherHand.length}
              disabled={!canDraw || animating}
              hidden={pendingCardIndex === index && pickFlight !== null}
              onPick={pickCard}
            />
          ))
        ) : (
          <p className="py-8 text-sm text-white/70">No cards to draw.</p>
        )}
      </FanHand>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 border-white/10 border-y px-3 py-3 lg:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)_minmax(10rem,1fr)] lg:gap-4 lg:px-4">
        <aside className="hidden flex-col justify-center gap-2 rounded-lg bg-black/15 px-3 py-3 text-white/85 lg:flex">
          <p className="font-medium text-sm">Table</p>
          {state.lastDraw ? (
            <p className="text-white/70 text-xs leading-relaxed">
              {roleName(game.players, state.lastDraw.actorRole)} drew from{" "}
              {roleName(game.players, state.lastDraw.fromRole)}
              {state.lastDraw.matchedRank
                ? ` and discarded ${state.lastDraw.matchedRank}s`
                : ""}
            </p>
          ) : (
            <p className="text-white/60 text-xs">No draws yet this round.</p>
          )}
          <p className="text-white/60 text-xs">Moves logged: {moves.length}</p>
        </aside>

        <div
          ref={discardPileRef}
          className="flex min-h-0 min-w-0 flex-col rounded-lg bg-black/20 ring-1 ring-white/10"
        >
          <p className="px-3 pt-2 text-center font-medium text-white/80 text-xs uppercase tracking-wider">
            Discard pile
          </p>
          <DiscardPile pairs={state.discardedPairs} />
        </div>

        <aside className="flex flex-col justify-center gap-2 rounded-lg bg-black/15 px-3 py-3 text-white/85">
          <div className="flex items-center gap-2">
            <FaUserCheck size={16} aria-hidden="true" />
            <p className="font-medium text-sm">Your hand</p>
            <span className="text-white/60 text-xs">{myHand.length}</span>
          </div>
          {canArrangeHand ? (
            <p className="text-amber-100 text-xs">
              New card is last — shuffle or keep order
            </p>
          ) : canDraw ? (
            <p className="text-emerald-200 text-xs">Your turn — pick a card</p>
          ) : (
            <p className="text-white/60 text-xs">
              {roleName(game.players, state.currentTurn)} picks next
            </p>
          )}
        </aside>
      </div>

      <FanHand
        ref={playerFanRef}
        cardCount={landingTotal}
        className={`old-maid-fan old-maid-player-fan w-full ${shufflingRole === myRole ? "old-maid-shuffle-active" : ""}`}
      >
        {myHand.length > 0 ? (
          myHand.map((card, index) => (
            <CardFace
              key={card.id}
              card={card}
              index={index}
              total={landingTotal}
              concealed={hiddenCardIds.has(card.id)}
            />
          ))
        ) : picking ? null : (
          <p className="py-8 text-sm text-white/70">Your hand is empty.</p>
        )}
        {picking ? (
          <div
            ref={landingSlotRef}
            aria-hidden="true"
            className={`${PLAYER_CARD_SHELL} pointer-events-none invisible`}
            style={fanStyle(myHand.length, landingTotal)}
          >
            <CardBack className="h-auto w-full" />
          </div>
        ) : null}
      </FanHand>
    </>
  );

  return (
    <div className="old-maid-stage flex h-full w-full min-w-0 flex-col">
      {!userId ? (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Sign in to join this table and play. Open the same link while signed
          in as the second player to fill the match.
        </p>
      ) : isLive ? (
        <div className="mb-3 flex items-center gap-3">
          <StatusDot online={Boolean(liveSocketKey) && connected} />
          <span className="text-muted-foreground text-sm">
            {canArrangeHand
              ? "Arrange your hand to continue"
              : isPast
                ? "Match finished"
                : "Connected to the table"}
          </span>
        </div>
      ) : null}

      {error ? <p className="mb-3 text-danger text-sm">{error}</p> : null}

      {!isPast && game.status === "active" ? (
        <TurnBanner
          currentTurn={state.currentTurn}
          handOrderPending={state.handOrderPending}
          myRole={myRole}
          players={game.players}
        />
      ) : null}

      {pickFlight ? (
        <FlyingCardOverlay
          durationMs={PICK_FLIGHT_MS}
          flight={pickFlight}
          flightKind="pick"
          onComplete={handlePickFlightEnd}
          shellRef={pickShellRef}
        >
          {pickRevealCard ? (
            <OldMaidCardArt card={pickRevealCard} className="h-full w-full" />
          ) : (
            <CardBack className="h-full w-full" />
          )}
        </FlyingCardOverlay>
      ) : null}

      {discardFlight
        ? (["0", "1"] as const).map((slot, index) => {
            const card = discardFlight.cards[index];
            const flight = discardFlight.flights[index];
            if (!card || !flight) return null;
            return (
              <FlyingCardOverlay
                durationMs={DISCARD_FLIGHT_MS}
                flight={flight}
                flightKind="discard"
                key={`${card.id}-discard`}
                onComplete={index === 0 ? handleDiscardFlightEnd : undefined}
              >
                <OldMaidCardArt card={card} />
              </FlyingCardOverlay>
            );
          })
        : null}

      <section
        className={`old-maid-table relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-emerald-950/40 shadow-black/25 shadow-inner ${animating ? "old-maid-animating" : ""}`}
      >
        {isPast && showResult ? (
          <GameResultPanel game={game} playerStats={playerStats} />
        ) : (
          tableContent
        )}

        {canArrangeHand && !(isPast && showResult) ? (
          <div className="absolute right-4 bottom-4 z-20 flex gap-2">
            <button
              type="button"
              onClick={() => emitHandOrder("keepOrder")}
              disabled={shufflingRole !== null}
              className="rounded-lg border border-white/30 bg-black/40 px-3 py-2 text-sm text-white/90 ring-2 ring-emerald-300/90 transition hover:bg-black/55 disabled:opacity-60"
            >
              Keep order
            </button>
            <button
              type="button"
              onClick={() => void handleShuffle()}
              disabled={shufflingRole !== null}
              className="rounded-lg border border-white/30 bg-black/40 px-3 py-2 text-sm text-white/90 ring-2 ring-emerald-300/90 transition hover:bg-black/55 disabled:opacity-60"
            >
              Shuffle
            </button>
          </div>
        ) : null}

        {isPast ? (
          <div className="absolute bottom-4 left-4 z-20">
            <button
              type="button"
              onClick={() => setShowResult((value) => !value)}
              className="rounded-lg border border-white/30 bg-black/45 px-4 py-2 text-sm text-white/90 transition hover:bg-black/60"
            >
              {showResult ? "Show table" : "Show result"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
