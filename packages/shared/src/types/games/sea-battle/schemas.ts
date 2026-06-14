import { z } from "zod";

const coordSchema = z
  .object({
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
  })
  .strict();
export type SeaBattleCoord = z.infer<typeof coordSchema>;

const shipSchema = z
  .object({
    cells: z.array(coordSchema).min(1).max(5),
  })
  .strict();
export type SeaBattleShip = z.infer<typeof shipSchema>;

const shotSchema = z
  .object({
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
    hit: z.boolean(),
  })
  .strict();
export type SeaBattleShot = z.infer<typeof shotSchema>;

export type SeaBattleRole = "A" | "B";

export const seaBattleStateSchema = z
  .object({
    phase: z.enum(["placement", "battle"]),
    fleets: z
      .object({
        A: z.array(shipSchema),
        B: z.array(shipSchema),
      })
      .strict(),
    shots: z
      .object({
        A: z.array(shotSchema),
        B: z.array(shotSchema),
      })
      .strict(),
    ready: z
      .object({
        A: z.boolean(),
        B: z.boolean(),
      })
      .strict(),
    currentTurn: z.enum(["A", "B"]),
  })
  .strict();
export type SeaBattleState = z.infer<typeof seaBattleStateSchema>;

export const placeMoveSchema = z
  .object({
    kind: z.literal("place"),
    ships: z.array(shipSchema),
  })
  .strict();
export type SeaBattlePlaceMove = z.infer<typeof placeMoveSchema>;

export const fireMoveSchema = z
  .object({
    kind: z.literal("fire"),
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
  })
  .strict();
export type SeaBattleFireMove = z.infer<typeof fireMoveSchema>;

export const seaBattleMoveSchema = z.discriminatedUnion("kind", [
  placeMoveSchema,
  fireMoveSchema,
]);
export type SeaBattleMove = z.infer<typeof seaBattleMoveSchema>;

export const seaBattleConfigSchema = z.object({}).strict();
export type SeaBattleConfig = z.infer<typeof seaBattleConfigSchema>;
