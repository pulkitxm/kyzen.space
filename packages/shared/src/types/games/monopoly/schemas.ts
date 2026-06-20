import { z } from "zod";

export const tileGroupSchema = z.enum([
  "Brown",
  "LightBlue",
  "Pink",
  "Orange",
  "Red",
  "Yellow",
  "Green",
  "DarkBlue",
  "Railroad",
  "Utility",
]);
export type TileGroup = z.infer<typeof tileGroupSchema>;

export const tileTypeSchema = z.enum([
  "Property",
  "Railroad",
  "Utility",
  "Go",
  "Jail",
  "FreeParking",
  "GoToJail",
  "CommunityChest",
  "Chance",
  "IncomeTax",
  "LuxuryTax",
]);
export type TileType = z.infer<typeof tileTypeSchema>;

const baseTileSchema = z.object({
  id: z.string(),
  position: z.number().int().min(0).max(31),
  name: z.string(),
  type: tileTypeSchema,
});

export const goTileSchema = baseTileSchema.extend({
  type: z.literal("Go"),
});
export type GoTile = z.infer<typeof goTileSchema>;

export const jailTileSchema = baseTileSchema.extend({
  type: z.literal("Jail"),
});
export type JailTile = z.infer<typeof jailTileSchema>;

export const freeParkingTileSchema = baseTileSchema.extend({
  type: z.literal("FreeParking"),
});
export type FreeParkingTile = z.infer<typeof freeParkingTileSchema>;

export const goToJailTileSchema = baseTileSchema.extend({
  type: z.literal("GoToJail"),
});
export type GoToJailTile = z.infer<typeof goToJailTileSchema>;

export const communityChestTileSchema = baseTileSchema.extend({
  type: z.literal("CommunityChest"),
});
export type CommunityChestTile = z.infer<typeof communityChestTileSchema>;

export const chanceTileSchema = baseTileSchema.extend({
  type: z.literal("Chance"),
});
export type ChanceTile = z.infer<typeof chanceTileSchema>;

export const incomeTaxTileSchema = baseTileSchema.extend({
  type: z.literal("IncomeTax"),
  amount: z.number().int(),
});
export type IncomeTaxTile = z.infer<typeof incomeTaxTileSchema>;

export const luxuryTaxTileSchema = baseTileSchema.extend({
  type: z.literal("LuxuryTax"),
  amount: z.number().int(),
});
export type LuxuryTaxTile = z.infer<typeof luxuryTaxTileSchema>;

export const propertyTileSchema = baseTileSchema.extend({
  type: z.literal("Property"),
  group: tileGroupSchema,
  price: z.number().int().positive(),
  rent: z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int(),
    z.number().int(),
    z.number().int(),
    z.number().int(),
  ]),
  houseCost: z.number().int().positive(),
});
export type PropertyTile = z.infer<typeof propertyTileSchema>;

export const railroadTileSchema = baseTileSchema.extend({
  type: z.literal("Railroad"),
  price: z.number().int().positive(),
  rent: z.tuple([
    z.literal(0),
    z.number().int(),
    z.number().int(),
    z.number().int(),
    z.number().int(),
  ]),
});
export type RailroadTile = z.infer<typeof railroadTileSchema>;

export const utilityTileSchema = baseTileSchema.extend({
  type: z.literal("Utility"),
  price: z.number().int().positive(),
});
export type UtilityTile = z.infer<typeof utilityTileSchema>;

export const tileSchema = z.discriminatedUnion("type", [
  goTileSchema,
  jailTileSchema,
  freeParkingTileSchema,
  goToJailTileSchema,
  communityChestTileSchema,
  chanceTileSchema,
  incomeTaxTileSchema,
  luxuryTaxTileSchema,
  propertyTileSchema,
  railroadTileSchema,
  utilityTileSchema,
]);
export type Tile = z.infer<typeof tileSchema>;

export const cardEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COLLECT"), amount: z.number().int() }),
  z.object({ kind: z.literal("PAY"), amount: z.number().int() }),
  z.object({
    kind: z.literal("MOVE_TO"),
    position: z.number().int().min(0).max(31),
    collectGo: z.boolean(),
  }),
  z.object({ kind: z.literal("MOVE_STEPS"), steps: z.number().int() }),
  z.object({
    kind: z.literal("MOVE_NEAREST"),
    tileType: z.enum(["Railroad", "Utility"]),
  }),
  z.object({ kind: z.literal("GET_OUT_OF_JAIL") }),
  z.object({ kind: z.literal("GO_TO_JAIL") }),
  z.object({
    kind: z.literal("REPAIRS"),
    perHouse: z.number().int(),
    perHotel: z.number().int(),
  }),
  z.object({ kind: z.literal("COLLECT_FROM_EACH"), amount: z.number().int() }),
  z.object({ kind: z.literal("PAY_EACH"), amount: z.number().int() }),
]);
export type CardEffect = z.infer<typeof cardEffectSchema>;

export const cardSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    effect: cardEffectSchema,
  })
  .strict();
export type Card = z.infer<typeof cardSchema>;

export const ownedPropertySchema = z
  .object({
    tileId: z.string(),
    houses: z.number().int().min(0).max(5),
    isMortgaged: z.boolean(),
  })
  .strict();
export type OwnedProperty = z.infer<typeof ownedPropertySchema>;

export const playerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    token: z.string(),
    balance: z.number().int(),
    position: z.number().int().min(0).max(31),
    inJail: z.boolean(),
    jailTurnsUsed: z.number().int().min(0),
    outOfJailCards: z.number().int().min(0),
    isBankrupt: z.boolean(),
    ownedProperties: z.array(ownedPropertySchema),
    consecutiveTimeouts: z.number().int().min(0),
  })
  .strict();
export type Player = z.infer<typeof playerSchema>;

export const turnPhaseSchema = z.enum([
  "WAITING_FOR_ROLL",
  "LANDED",
  "WAITING_FOR_END_TURN",
  "GAME_OVER",
]);
export type TurnPhase = z.infer<typeof turnPhaseSchema>;

export const monopolyStateSchema = z
  .object({
    board: z.array(tileSchema),
    players: z.array(playerSchema),
    currentPlayerIndex: z.number().int().min(0),
    turnPhase: turnPhaseSchema,
    dice: z.tuple([
      z.number().int().min(1).max(6),
      z.number().int().min(1).max(6),
    ]),
    doublesCount: z.number().int().min(0),
    chanceDeck: z.array(cardSchema),
    communityDeck: z.array(cardSchema),
    log: z.array(z.string()),
    winnerId: z.string().nullable(),
  })
  .strict();
export type MonopolyState = z.infer<typeof monopolyStateSchema>;

export const monopolyMoveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ROLL_DICE"),
    payload: z.object({
      die1: z.number().int().min(1).max(6),
      die2: z.number().int().min(1).max(6),
    }),
  }),
  z.object({ type: z.literal("BUY_PROPERTY") }),
  z.object({ type: z.literal("DECLINE_PURCHASE") }),
  z.object({
    type: z.literal("BUILD_HOUSE"),
    payload: z.object({ tileId: z.string() }),
  }),
  z.object({
    type: z.literal("SELL_HOUSE"),
    payload: z.object({ tileId: z.string() }),
  }),
  z.object({
    type: z.literal("MORTGAGE_PROPERTY"),
    payload: z.object({ tileId: z.string() }),
  }),
  z.object({
    type: z.literal("UNMORTGAGE_PROPERTY"),
    payload: z.object({ tileId: z.string() }),
  }),
  z.object({ type: z.literal("PAY_JAIL_FINE") }),
  z.object({ type: z.literal("USE_OUT_OF_JAIL_CARD") }),
  z.object({ type: z.literal("END_TURN") }),
  z.object({ type: z.literal("DECLARE_BANKRUPTCY") }),
  z.object({ type: z.literal("DRAW_CARD") }),
  z.object({ type: z.literal("TIMEOUT_SKIP") }),
]);
export type MonopolyMove = z.infer<typeof monopolyMoveSchema>;

export const monopolyConfigSchema = z.object({}).strict();
export type MonopolyConfig = z.infer<typeof monopolyConfigSchema>;
