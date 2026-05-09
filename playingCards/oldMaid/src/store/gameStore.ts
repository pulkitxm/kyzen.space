import { create } from 'zustand';

export type GamePhase = 'home' | 'lobby' | 'dealing' | 'playing' | 'gameover';

export interface Player {
  id: string;
  name: string;
  handSize: number;
  isEliminated: boolean;
  isConnected: boolean;
}

export interface Card {
  id: string;
  rank: string;
  suit: string;
}

interface GameState {
  // Room
  roomCode: string | null;
  playerId: string | null;
  playerName: string | null;
  phase: GamePhase;
  players: Player[];

  // My hand
  myHand: string[];

  // Turn
  currentTurn: string | null;
  canPickFrom: string | null;

  // Game over
  loserId: string | null;
  loserHeldCard: string | null;

  // Animations
  discardingCards: string[];
  pickingState: { from: string, to: string, cardIdx: number } | null;

  // Actions
  setRoom: (code: string, playerId: string) => void;
  setPlayerName: (name: string) => void;
  setPhase: (phase: GamePhase) => void;
  setPlayers: (players: Player[]) => void;
  updateHandSizes: (handSizes: { [playerId: string]: number }) => void;
  setMyHand: (cardIds: string[]) => void;
  setCurrentTurn: (playerId: string, canPickFrom?: string) => void;
  eliminatePlayer: (playerId: string) => void;
  setGameOver: (loserId: string, loserHeldCard: string) => void;
  addDiscardedCards: (cardIds: string[]) => void;
  setPickingState: (state: { from: string, to: string, cardIdx: number } | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  roomCode: null,
  playerId: null,
  playerName: null,
  phase: 'home',
  players: [],
  myHand: [],
  currentTurn: null,
  canPickFrom: null,
  loserId: null,
  loserHeldCard: null,
  discardingCards: [],
  pickingState: null,

  setRoom: (code, playerId) => set({ roomCode: code, playerId }),
  setPlayerName: (name) => set({ playerName: name }),
  setPhase: (phase) => set({ phase }),
  setPlayers: (players) => set({ players }),
  updateHandSizes: (handSizes) => set((state) => ({
    players: state.players.map(p => ({
      ...p,
      handSize: handSizes[p.id] ?? p.handSize
    }))
  })),
  setMyHand: (cardIds) => set({ myHand: cardIds }),
  setCurrentTurn: (playerId, canPickFrom) => set({ 
    currentTurn: playerId, 
    canPickFrom: canPickFrom || null 
  }),
  eliminatePlayer: (playerId) => set((state) => ({
    players: state.players.map(p => 
      p.id === playerId ? { ...p, isEliminated: true } : p
    )
  })),
  setGameOver: (loserId, loserHeldCard) => set({ 
    loserId, 
    loserHeldCard, 
    phase: 'gameover' 
  }),
  addDiscardedCards: (cardIds) => {
    set({ discardingCards: cardIds });
    setTimeout(() => set({ discardingCards: [] }), 2000);
  },
  setPickingState: (pickingState) => set({ pickingState }),
  resetGame: () => set({
    phase: 'home',
    roomCode: null,
    players: [],
    myHand: [],
    currentTurn: null,
    canPickFrom: null,
    loserId: null,
    loserHeldCard: null,
    pickingState: null,
    discardingCards: []
  })
}));
