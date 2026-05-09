export class GameEngine {
  private seed: number;

  constructor(seed: number = Math.random() * 1000000) {
    this.seed = seed;
  }

  // Simple seeded random
  private random() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  createDeck(): string[] {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: string[] = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        // Remove Queen of Spades
        if (rank === 'Q' && suit === 'spades') continue;
        deck.push(`${rank}-${suit}`);
      }
    }

    deck.push('joker'); // The Old Maid
    return deck;
  }

  setupGame(playerIds: string[]): { [playerId: string]: string[] } {
    const deck = this.createDeck();
    this.shuffle(deck);

    const hands: { [playerId: string]: string[] } = {};
    playerIds.forEach(id => hands[id] = []);

    let currentPlayerIdx = 0;
    while (deck.length > 0) {
      const card = deck.pop()!;
      hands[playerIds[currentPlayerIdx]].push(card);
      currentPlayerIdx = (currentPlayerIdx + 1) % playerIds.length;
    }

    return hands;
  }

  discardPairs(hand: string[]): { newHand: string[], discardedPairs: string[] } {
    const rankMap: { [rank: string]: string[] } = {};
    const newHand: string[] = [];
    const discardedPairs: string[] = [];

    for (const card of hand) {
      if (card === 'joker') {
        newHand.push(card);
        continue;
      }

      const [rank] = card.split('-');
      if (!rankMap[rank]) {
        rankMap[rank] = [];
      }
      rankMap[rank].push(card);
    }

    for (const rank in rankMap) {
      const cards = rankMap[rank];
      while (cards.length >= 2) {
        discardedPairs.push(cards.pop()!);
        discardedPairs.push(cards.pop()!);
      }
      if (cards.length === 1) {
        newHand.push(cards[0]);
      }
    }

    return { newHand, discardedPairs };
  }
}
