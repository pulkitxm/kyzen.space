import { OLD_MAID } from "@gamelobby/shared/constants";
import {
  type GameEngine,
  type OldMaidCard,
  type OldMaidDiscardedPair,
  type OldMaidMove,
  type OldMaidPairRank,
  type OldMaidRole,
  type OldMaidState,
  oldMaidMoveSchema,
  type ReduceResult,
  type Seat,
} from "@gamelobby/shared/types";

const ROLES = ["P1", "P2"] as const satisfies readonly OldMaidRole[];
const SUITS = ["S", "H", "D", "C"] as const;
const PAIR_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const satisfies readonly OldMaidPairRank[];

function makeSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomFromSeed(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createOldMaidDeck(): OldMaidCard[] {
  const deck: OldMaidCard[] = [];
  for (const rank of PAIR_RANKS) {
    for (const suit of SUITS) {
      if (rank === "Q" && suit === "S") continue;
      deck.push({ id: `${rank}-${suit}`, rank, suit });
    }
  }
  deck.push({ id: "JOKER", rank: "JOKER", suit: "JOKER" });
  return deck;
}

export function shuffleDeck(deck: OldMaidCard[], seed: string): OldMaidCard[] {
  const random = randomFromSeed(seed);
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const nextI = shuffled[j];
    const nextJ = shuffled[i];
    if (nextI === undefined || nextJ === undefined) continue;
    shuffled[i] = nextI;
    shuffled[j] = nextJ;
  }
  return shuffled;
}

function deal(deck: OldMaidCard[]): Record<OldMaidRole, OldMaidCard[]> {
  const hands: Record<OldMaidRole, OldMaidCard[]> = { P1: [], P2: [] };
  deck.forEach((card, index) => {
    const role = ROLES[index % ROLES.length];
    if (role) hands[role].push(card);
  });
  return hands;
}

function isPairRank(rank: string): rank is OldMaidPairRank {
  return PAIR_RANKS.includes(rank as OldMaidPairRank);
}

function removePairs(
  hand: OldMaidCard[],
  byRole: OldMaidRole,
  phase: OldMaidDiscardedPair["phase"],
): { hand: OldMaidCard[]; pairs: OldMaidDiscardedPair[] } {
  const remaining = [...hand];
  const pairs: OldMaidDiscardedPair[] = [];

  for (const rank of PAIR_RANKS) {
    let indices = remaining
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.rank === rank)
      .map(({ index }) => index);

    while (indices.length >= 2) {
      const second = indices[1];
      const first = indices[0];
      if (first === undefined || second === undefined) break;
      const cards = [remaining[first], remaining[second]];
      if (cards[0] === undefined || cards[1] === undefined) break;
      pairs.push({ byRole, cards: [cards[0], cards[1]], phase, rank });
      remaining.splice(second, 1);
      remaining.splice(first, 1);
      indices = remaining
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => card.rank === rank)
        .map(({ index }) => index);
    }
  }

  return { hand: remaining, pairs };
}

function activeRolesFor(
  hands: Record<OldMaidRole, OldMaidCard[]>,
): OldMaidRole[] {
  return ROLES.filter((role) => hands[role].length > 0);
}

function nextRole(role: OldMaidRole, activeRoles: OldMaidRole[]): OldMaidRole {
  const start = ROLES.indexOf(role);
  for (let offset = 1; offset <= ROLES.length; offset++) {
    const candidate = ROLES[(start + offset) % ROLES.length];
    if (candidate && activeRoles.includes(candidate)) return candidate;
  }
  return role;
}

function rightNeighbor(
  role: OldMaidRole,
  activeRoles: OldMaidRole[],
): OldMaidRole {
  const start = ROLES.indexOf(role);
  for (let offset = 1; offset <= ROLES.length; offset++) {
    const index = (start - offset + ROLES.length) % ROLES.length;
    const candidate = ROLES[index];
    if (candidate && activeRoles.includes(candidate)) return candidate;
  }
  return role;
}

function finalized(state: OldMaidState): OldMaidState {
  const activeRoles = activeRolesFor(state.hands);
  const winnerRoles = ROLES.filter((role) => state.hands[role].length === 0);
  const loserRole = activeRoles.length === 1 ? (activeRoles[0] ?? null) : null;
  return {
    ...state,
    activeRoles,
    currentTurn:
      loserRole ??
      (activeRoles.includes(state.currentTurn)
        ? state.currentTurn
        : nextRole(state.currentTurn, activeRoles)),
    loserRole,
    winnerRoles,
  };
}

function createStateWithSeed(seed: string): OldMaidState {
  const dealt = deal(shuffleDeck(createOldMaidDeck(), seed));
  const p1 = removePairs(dealt.P1, "P1", "initial");
  const p2 = removePairs(dealt.P2, "P2", "initial");
  const state: OldMaidState = {
    activeRoles: ["P1", "P2"],
    currentTurn: "P1",
    deckSeed: seed,
    discardedPairs: [...p1.pairs, ...p2.pairs],
    hands: { P1: p1.hand, P2: p2.hand },
    lastDraw: null,
    loserRole: null,
    winnerRoles: [],
  };
  return finalized(state);
}

export function createInitialOldMaidState(_seats: Seat[]): OldMaidState {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = createStateWithSeed(makeSeed());
    if (!state.loserRole) return state;
  }
  return createStateWithSeed("old-maid-fallback-seed");
}

function isTerminal(state: OldMaidState): boolean {
  return state.loserRole !== null || state.activeRoles.length <= 1;
}

export const oldMaidEngine: GameEngine<OldMaidState, OldMaidMove> = {
  type: OLD_MAID,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,
  roles: ROLES,

  createInitialState(seats): OldMaidState {
    return createInitialOldMaidState(seats);
  },

  reduce(state, ctx, input): ReduceResult<OldMaidState> {
    if (isTerminal(state)) {
      return { ok: false, error: "Game is not active" };
    }
    if (ctx.role !== "P1" && ctx.role !== "P2") {
      return { ok: false, error: "Not a player in this game" };
    }
    if (state.currentTurn !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }

    const parsed = oldMaidMoveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid move" };

    const actorRole = ctx.role;
    const fromRole = rightNeighbor(actorRole, state.activeRoles);
    if (fromRole === actorRole)
      return { ok: false, error: "No opponent cards" };

    const actorHand = [...state.hands[actorRole]];
    const fromHand = [...state.hands[fromRole]];
    const drawn = fromHand[parsed.data.cardIndex];
    if (!drawn) return { ok: false, error: "Card not available" };

    fromHand.splice(parsed.data.cardIndex, 1);
    const afterDraw = [...actorHand, drawn];
    const discard = isPairRank(drawn.rank)
      ? afterDraw.findIndex(
          (card, index) =>
            index !== afterDraw.length - 1 && card.rank === drawn.rank,
        )
      : -1;

    let nextActorHand = afterDraw;
    let discardedPairs = state.discardedPairs;
    let matchedRank: OldMaidPairRank | null = null;

    if (discard >= 0 && isPairRank(drawn.rank)) {
      const matched = afterDraw[discard];
      if (!matched) return { ok: false, error: "Invalid pair" };
      nextActorHand = afterDraw.filter(
        (_card, index) => index !== discard && index !== afterDraw.length - 1,
      );
      matchedRank = drawn.rank;
      discardedPairs = [
        ...state.discardedPairs,
        {
          byRole: actorRole,
          cards: [matched, drawn],
          phase: "draw",
          rank: drawn.rank,
        },
      ];
    }

    const hands = {
      ...state.hands,
      [actorRole]: nextActorHand,
      [fromRole]: fromHand,
    };
    const activeRoles = activeRolesFor(hands);
    const currentTurn = activeRoles.includes(actorRole)
      ? nextRole(actorRole, activeRoles)
      : nextRole(fromRole, activeRoles);
    const nextState = finalized({
      ...state,
      activeRoles,
      currentTurn,
      discardedPairs,
      hands,
      lastDraw: { actorRole, fromRole, matchedRank },
      loserRole: null,
      winnerRoles: [],
    });

    if (nextState.loserRole) {
      const winnerRole =
        nextState.winnerRoles.find((role) => role !== nextState.loserRole) ??
        null;
      return {
        ok: true,
        state: nextState,
        outcome: { status: "completed", winnerRole, draw: false },
      };
    }

    return { ok: true, state: nextState, outcome: { status: "active" } };
  },
};
