import { z } from "zod";

export const oldMaidRoleSchema = z.enum(["P1", "P2"]);
export type OldMaidRole = z.infer<typeof oldMaidRoleSchema>;

export const oldMaidSuitSchema = z.enum(["S", "H", "D", "C", "JOKER"]);
export type OldMaidSuit = z.infer<typeof oldMaidSuitSchema>;

export const oldMaidRankSchema = z.enum([
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
  "JOKER",
]);
export type OldMaidRank = z.infer<typeof oldMaidRankSchema>;

export const oldMaidPairRankSchema = z.enum([
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
]);
export type OldMaidPairRank = z.infer<typeof oldMaidPairRankSchema>;

export const oldMaidCardSchema = z
  .object({
    id: z.string().min(1),
    rank: oldMaidRankSchema,
    suit: oldMaidSuitSchema,
  })
  .strict();
export type OldMaidCard = z.infer<typeof oldMaidCardSchema>;

export const oldMaidDiscardedPairSchema = z
  .object({
    byRole: oldMaidRoleSchema,
    cards: z.tuple([oldMaidCardSchema, oldMaidCardSchema]),
    phase: z.enum(["initial", "draw"]),
    rank: oldMaidPairRankSchema,
  })
  .strict();
export type OldMaidDiscardedPair = z.infer<typeof oldMaidDiscardedPairSchema>;

export const oldMaidLastDrawSchema = z
  .object({
    actorRole: oldMaidRoleSchema,
    fromRole: oldMaidRoleSchema,
    matchedRank: oldMaidPairRankSchema.nullable(),
  })
  .strict();
export type OldMaidLastDraw = z.infer<typeof oldMaidLastDrawSchema>;

export const oldMaidHandsSchema = z
  .object({
    P1: z.array(oldMaidCardSchema).max(52),
    P2: z.array(oldMaidCardSchema).max(52),
  })
  .strict();
export type OldMaidHands = z.infer<typeof oldMaidHandsSchema>;

export const oldMaidStateSchema = z
  .object({
    activeRoles: z.array(oldMaidRoleSchema).min(1).max(2),
    currentTurn: oldMaidRoleSchema,
    deckSeed: z.string().min(1),
    discardedPairs: z.array(oldMaidDiscardedPairSchema).max(26),
    hands: oldMaidHandsSchema,
    lastDraw: oldMaidLastDrawSchema.nullable(),
    loserRole: oldMaidRoleSchema.nullable(),
    winnerRoles: z.array(oldMaidRoleSchema).max(2),
  })
  .strict();
export type OldMaidState = z.infer<typeof oldMaidStateSchema>;

export const oldMaidMoveSchema = z
  .object({
    cardIndex: z.number().int().min(0).max(51),
  })
  .strict();
export type OldMaidMove = z.infer<typeof oldMaidMoveSchema>;

export const oldMaidConfigSchema = z.object({}).strict();
export type OldMaidConfig = z.infer<typeof oldMaidConfigSchema>;
