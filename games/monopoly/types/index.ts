// ─────────────────────────────────────────────
// Tile / Board
// ─────────────────────────────────────────────

export type TileGroup =
  | 'Brown'
  | 'LightBlue'
  | 'Pink'
  | 'Orange'
  | 'Red'
  | 'Yellow'
  | 'Green'
  | 'DarkBlue'
  | 'Railroad'
  | 'Utility';

export type TileType =
  | 'Property'
  | 'Railroad'
  | 'Utility'
  | 'Go'
  | 'Jail'
  | 'FreeParking'
  | 'GoToJail'
  | 'CommunityChest'
  | 'Chance'
  | 'IncomeTax'
  | 'LuxuryTax';

interface BaseTile {
  readonly id: string;
  readonly position: number; // 0–39
  readonly name: string;
  readonly type: TileType;
}

export interface GoTile extends BaseTile { readonly type: 'Go'; }
export interface JailTile extends BaseTile { readonly type: 'Jail'; }
export interface FreeParkingTile extends BaseTile { readonly type: 'FreeParking'; }
export interface GoToJailTile extends BaseTile { readonly type: 'GoToJail'; }
export interface CommunityChestTile extends BaseTile { readonly type: 'CommunityChest'; }
export interface ChanceTile extends BaseTile { readonly type: 'Chance'; }
export interface IncomeTaxTile extends BaseTile { readonly type: 'IncomeTax'; readonly amount: number; }
export interface LuxuryTaxTile extends BaseTile { readonly type: 'LuxuryTax'; readonly amount: number; }

export interface PropertyTile extends BaseTile {
  readonly type: 'Property';
  readonly group: TileGroup;
  readonly price: number;
  /** rent[0]=base, [1]=1h, [2]=2h, [3]=3h, [4]=4h, [5]=hotel */
  readonly rent: readonly [number, number, number, number, number, number];
  readonly houseCost: number;
}

export interface RailroadTile extends BaseTile {
  readonly type: 'Railroad';
  readonly price: number;
  /** rent[n] = rent with n railroads owned (index 0 unused) */
  readonly rent: readonly [0, number, number, number, number];
}

export interface UtilityTile extends BaseTile {
  readonly type: 'Utility';
  readonly price: number;
}

export type Tile =
  | GoTile
  | JailTile
  | FreeParkingTile
  | GoToJailTile
  | CommunityChestTile
  | ChanceTile
  | IncomeTaxTile
  | LuxuryTaxTile
  | PropertyTile
  | RailroadTile
  | UtilityTile;

// ─────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────

export type CardEffect =
  | { kind: 'COLLECT'; amount: number }
  | { kind: 'PAY'; amount: number }
  | { kind: 'MOVE_TO'; position: number; collectGo: boolean }
  | { kind: 'MOVE_STEPS'; steps: number }
  | { kind: 'MOVE_NEAREST'; tileType: 'Railroad' | 'Utility' }
  | { kind: 'GET_OUT_OF_JAIL' }
  | { kind: 'GO_TO_JAIL' }
  | { kind: 'REPAIRS'; perHouse: number; perHotel: number }
  | { kind: 'COLLECT_FROM_EACH'; amount: number }
  | { kind: 'PAY_EACH'; amount: number };

export interface Card {
  readonly id: string;
  readonly text: string;
  readonly effect: CardEffect;
}

// ─────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────

export type PlayerId = string;

export interface OwnedProperty {
  readonly tileId: string;
  houses: number; // 5 = hotel
  isMortgaged: boolean;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly token: string; // emoji or asset key
  balance: number;
  position: number;
  inJail: boolean;
  jailTurnsUsed: number;
  outOfJailCards: number;
  isBankrupt: boolean;
  ownedProperties: ReadonlyArray<OwnedProperty>;
}

// ─────────────────────────────────────────────
// Game Phase
// ─────────────────────────────────────────────

export type TurnPhase =
  | 'WAITING_FOR_ROLL'
  | 'LANDED'           // tile effect may need to be resolved
  | 'AUCTION'
  | 'WAITING_FOR_END_TURN'
  | 'GAME_OVER';

// ─────────────────────────────────────────────
// GameState (fully immutable, serialisable)
// ─────────────────────────────────────────────

export interface GameState {
  readonly board: ReadonlyArray<Tile>;
  readonly players: ReadonlyArray<Player>;
  readonly currentPlayerIndex: number;
  readonly turnPhase: TurnPhase;
  readonly dice: readonly [number, number];
  readonly doublesCount: number;
  readonly chanceDeck: ReadonlyArray<Card>;
  readonly communityDeck: ReadonlyArray<Card>;
  /** Log of resolved events for the UI */
  readonly log: ReadonlyArray<string>;
  readonly winnerId: PlayerId | null;
}

// ─────────────────────────────────────────────
// Actions (union – no `any`)
// ─────────────────────────────────────────────

export interface RollDiceAction {
  type: 'ROLL_DICE';
  /** Injected by caller so the engine stays deterministic */
  payload: { die1: number; die2: number };
}

export interface BuyPropertyAction {
  type: 'BUY_PROPERTY';
}

export interface DeclinePurchaseAction {
  type: 'DECLINE_PURCHASE';
}

export interface BuildHouseAction {
  type: 'BUILD_HOUSE';
  payload: { tileId: string };
}

export interface SellHouseAction {
  type: 'SELL_HOUSE';
  payload: { tileId: string };
}

export interface MortgagePropertyAction {
  type: 'MORTGAGE_PROPERTY';
  payload: { tileId: string };
}

export interface UnmortgagePropertyAction {
  type: 'UNMORTGAGE_PROPERTY';
  payload: { tileId: string };
}

export interface PayJailFineAction {
  type: 'PAY_JAIL_FINE';
}

export interface UseOutOfJailCardAction {
  type: 'USE_OUT_OF_JAIL_CARD';
}

export interface EndTurnAction {
  type: 'END_TURN';
}

export interface DeclareBankruptcyAction {
  type: 'DECLARE_BANKRUPTCY';
}

export interface DrawCardAction {
  type: 'DRAW_CARD';
}

export type Action =
  | RollDiceAction
  | BuyPropertyAction
  | DeclinePurchaseAction
  | BuildHouseAction
  | SellHouseAction
  | MortgagePropertyAction
  | UnmortgagePropertyAction
  | PayJailFineAction
  | UseOutOfJailCardAction
  | EndTurnAction
  | DeclareBankruptcyAction
  | DrawCardAction;
