import type { GameState, Player } from '../types';
import { BOARD } from './board';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from './cards';

const PLAYER_TOKENS = ['🎩', '🚗', '🐶', '👢', '⛵', '🎲', '🏖️', '🚂'];

/** Shuffles an array deterministically given a seed-based random function, or using Math.random if none provided. */
function shuffle<T>(arr: ReadonlyArray<T>, rand: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Creates the initial GameState for a new game.
 * @param playerNames - list of display names (2-8 players)
 * @param rand - optional RNG for deck shuffling (defaults to Math.random, useful for testing)
 */
export function createInitialState(
  playerNames: ReadonlyArray<string>,
  rand: () => number = Math.random
): GameState {
  if (playerNames.length < 2 || playerNames.length > 8) {
    throw new Error('Monopoly requires 2–8 players.');
  }

  const players: Player[] = playerNames.map((name, i) => ({
    id: `player_${i}`,
    name,
    token: PLAYER_TOKENS[i],
    balance: 1500,
    position: 0,
    inJail: false,
    jailTurnsUsed: 0,
    outOfJailCards: 0,
    isBankrupt: false,
    ownedProperties: [],
  }));

  return {
    board: BOARD,
    players,
    currentPlayerIndex: 0,
    turnPhase: 'WAITING_FOR_ROLL',
    dice: [1, 1],
    doublesCount: 0,
    chanceDeck: shuffle(CHANCE_CARDS, rand),
    communityDeck: shuffle(COMMUNITY_CHEST_CARDS, rand),
    log: [`Game started with ${playerNames.join(', ')}. ${playerNames[0]}'s turn.`],
    winnerId: null,
  };
}
