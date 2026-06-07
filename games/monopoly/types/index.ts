export type TileGroup =
  | "Brown"
  | "LightBlue"
  | "Pink"
  | "Orange"
  | "Red"
  | "Yellow"
  | "Green"
  | "DarkBlue"
  | "Railroad"
  | "Utility";

export type TileType =
  | "Property"
  | "Railroad"
  | "Utility"
  | "Go"
  | "Jail"
  | "FreeParking"
  | "GoToJail"
  | "CommunityChest"
  | "Chance"
  | "IncomeTax"
  | "LuxuryTax";

interface BaseTile {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly type: TileType;
}

export interface GoTile extends BaseTile {
  readonly type: "Go";
}
export interface JailTile extends BaseTile {
  readonly type: "Jail";
}
export interface FreeParkingTile extends BaseTile {
  readonly type: "FreeParking";
}
export interface GoToJailTile extends BaseTile {
  readonly type: "GoToJail";
}
export interface CommunityChestTile extends BaseTile {
  readonly type: "CommunityChest";
}
export interface ChanceTile extends BaseTile {
  readonly type: "Chance";
}
export interface IncomeTaxTile extends BaseTile {
  readonly type: "IncomeTax";
  readonly amount: number;
}
export interface LuxuryTaxTile extends BaseTile {
  readonly type: "LuxuryTax";
  readonly amount: number;
}

export interface PropertyTile extends BaseTile {
  readonly type: "Property";
  readonly group: TileGroup;
  readonly price: number;
  readonly rent: readonly [number, number, number, number, number, number];
  readonly houseCost: number;
}

export interface RailroadTile extends BaseTile {
  readonly type: "Railroad";
  readonly price: number;
  readonly rent: readonly [0, number, number, number, number];
}

export interface UtilityTile extends BaseTile {
  readonly type: "Utility";
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

export type CardEffect =
  | { kind: "COLLECT"; amount: number }
  | { kind: "PAY"; amount: number }
  | { kind: "MOVE_TO"; position: number; collectGo: boolean }
  | { kind: "MOVE_STEPS"; steps: number }
  | { kind: "MOVE_NEAREST"; tileType: "Railroad" | "Utility" }
  | { kind: "GET_OUT_OF_JAIL" }
  | { kind: "GO_TO_JAIL" }
  | { kind: "REPAIRS"; perHouse: number; perHotel: number }
  | { kind: "COLLECT_FROM_EACH"; amount: number }
  | { kind: "PAY_EACH"; amount: number };

export interface Card {
  readonly id: string;
  readonly text: string;
  readonly effect: CardEffect;
}

export type PlayerId = string;

export interface OwnedProperty {
  readonly tileId: string;
  houses: number;
  isMortgaged: boolean;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly token: string;
  balance: number;
  position: number;
  inJail: boolean;
  jailTurnsUsed: number;
  outOfJailCards: number;
  isBankrupt: boolean;
  ownedProperties: ReadonlyArray<OwnedProperty>;
}

export type TurnPhase =
  | "WAITING_FOR_ROLL"
  | "LANDED"
  | "AUCTION"
  | "WAITING_FOR_END_TURN"
  | "GAME_OVER";

export interface GameState {
  readonly board: ReadonlyArray<Tile>;
  readonly players: ReadonlyArray<Player>;
  readonly currentPlayerIndex: number;
  readonly turnPhase: TurnPhase;
  readonly dice: readonly [number, number];
  readonly doublesCount: number;
  readonly chanceDeck: ReadonlyArray<Card>;
  readonly communityDeck: ReadonlyArray<Card>;
  readonly log: ReadonlyArray<string>;
  readonly winnerId: PlayerId | null;
}

export interface RollDiceAction {
  type: "ROLL_DICE";
  payload: { die1: number; die2: number };
}

export interface BuyPropertyAction {
  type: "BUY_PROPERTY";
}

export interface DeclinePurchaseAction {
  type: "DECLINE_PURCHASE";
}

export interface BuildHouseAction {
  type: "BUILD_HOUSE";
  payload: { tileId: string };
}

export interface SellHouseAction {
  type: "SELL_HOUSE";
  payload: { tileId: string };
}

export interface MortgagePropertyAction {
  type: "MORTGAGE_PROPERTY";
  payload: { tileId: string };
}

export interface UnmortgagePropertyAction {
  type: "UNMORTGAGE_PROPERTY";
  payload: { tileId: string };
}

export interface PayJailFineAction {
  type: "PAY_JAIL_FINE";
}

export interface UseOutOfJailCardAction {
  type: "USE_OUT_OF_JAIL_CARD";
}

export interface EndTurnAction {
  type: "END_TURN";
}

export interface DeclareBankruptcyAction {
  type: "DECLARE_BANKRUPTCY";
}

export interface DrawCardAction {
  type: "DRAW_CARD";
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
