import { z } from "zod";
import { botDifficultySchema, lobbyConfigSchema } from "../lobby";

export const TANK_ARENA_MAX_ROUND = 40;
export const TANK_ARENA_SECRET_WORDS = 8;

const MAX_COOLDOWN = 8;
const MAX_HP = 160;
const MAX_STEPS = 900;

const coordinate = z.number().finite().min(-1e12).max(1e12);
const velocity = z.number().finite().min(-10_000).max(10_000);
const itemId = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const word = z.number().int().min(0).max(4_294_967_295);
const roundNumber = z.number().int().min(0).max(TANK_ARENA_MAX_ROUND);
const playRound = z.number().int().min(1).max(TANK_ARENA_MAX_ROUND);

export const tankRoleSchema = z.string().regex(/^p[1-9]\d*$/);
const tankTeamSchema = z.string().regex(/^([A-Z]|p[1-9]\d*)$/);

export const tankKindSchema = z.enum(["bastion", "kestrel"]);
export type TankKind = z.infer<typeof tankKindSchema>;

export const tankActionSchema = z.enum([
  "missile",
  "jump",
  "shield",
  "specialA",
  "specialB",
  "idle",
]);
export type TankAction = z.infer<typeof tankActionSchema>;

const planActionSchema = z.enum([...tankActionSchema.options, "forfeit"]);
export type TankPlanAction = z.infer<typeof planActionSchema>;

export const tankPickupKindSchema = z.enum([
  "repair",
  "overcharge",
  "plating",
  "coolant",
]);
export type TankPickupKind = z.infer<typeof tankPickupKindSchema>;

export const tankAngleSchema = z.number().finite().min(-180).max(180);
export const tankPowerSchema = z.number().finite().min(0.15).max(1);

const cooldownSchema = z.number().int().min(0).max(MAX_COOLDOWN);

const tankSchema = z
  .object({
    role: tankRoleSchema,
    kind: tankKindSchema.nullable(),
    x: coordinate,
    y: coordinate,
    vx: velocity,
    vy: velocity,
    hp: z.number().finite().min(0).max(MAX_HP),
    alive: z.boolean(),
    fell: z.boolean(),
    forfeited: z.boolean(),
    cooldowns: z
      .object({ specialA: cooldownSchema, specialB: cooldownSchema })
      .strict(),
    effects: z
      .object({
        overcharge: z.boolean(),
        platingRounds: z.number().int().min(0).max(2),
      })
      .strict(),
  })
  .strict();
export type TankArenaTank = z.infer<typeof tankSchema>;

const pickupSchema = z
  .object({
    id: itemId,
    kind: tankPickupKindSchema,
    x: coordinate,
    y: coordinate,
  })
  .strict();
export type TankArenaPickup = z.infer<typeof pickupSchema>;

const mineSchema = z
  .object({ id: itemId, x: coordinate, y: coordinate })
  .strict();
export type TankArenaMine = z.infer<typeof mineSchema>;

const airstrikeSchema = z
  .object({
    round: playRound,
    columns: z.array(coordinate).min(1),
  })
  .strict();
export type TankArenaAirstrike = z.infer<typeof airstrikeSchema>;

const planSchema = z
  .object({
    action: planActionSchema,
    angle: tankAngleSchema,
    power: tankPowerSchema,
  })
  .strict();
export type TankArenaPlan = z.infer<typeof planSchema>;

const seatSchema = z
  .object({
    role: tankRoleSchema,
    team: tankTeamSchema,
    bot: botDifficultySchema.nullable(),
  })
  .strict();
export type TankArenaSeat = z.infer<typeof seatSchema>;

const eliminationCauseSchema = z.enum(["destroyed", "fell", "forfeit"]);
export type TankEliminationCause = z.infer<typeof eliminationCauseSchema>;

const snapshotSchema = z
  .object({
    tanks: z.array(tankSchema),
    pickups: z.array(pickupSchema),
    mines: z.array(mineSchema),
    airstrike: airstrikeSchema.nullable(),
  })
  .strict();
export type TankArenaSnapshot = z.infer<typeof snapshotSchema>;

const resolutionSchema = z
  .object({
    round: playRound,
    seed: word,
    steps: z.number().int().min(1).max(MAX_STEPS),
    before: snapshotSchema,
    plans: z.record(tankRoleSchema, planSchema),
    damage: z.array(
      z
        .object({
          role: tankRoleSchema,
          amount: z.number().int().min(0).max(100_000),
        })
        .strict(),
    ),
    collected: z.array(
      z.object({ role: tankRoleSchema, kind: tankPickupKindSchema }).strict(),
    ),
    eliminated: z.array(
      z
        .object({ role: tankRoleSchema, cause: eliminationCauseSchema })
        .strict(),
    ),
  })
  .strict();
export type TankArenaResolution = z.infer<typeof resolutionSchema>;

export const tankArenaStateSchema = z
  .object({
    version: z.literal(2),
    secret: z.array(word).length(TANK_ARENA_SECRET_WORDS).optional(),
    round: roundNumber,
    phase: z.enum(["select", "plan", "finished"]),
    modules: z.number().int().min(2),
    seats: z.array(seatSchema).min(1),
    tanks: z.array(tankSchema).min(1),
    pickups: z.array(pickupSchema),
    mines: z.array(mineSchema),
    nextId: itemId,
    airstrike: airstrikeSchema.nullable(),
    submitted: z.array(tankRoleSchema),
    plans: z.record(tankRoleSchema, planSchema),
    resolution: resolutionSchema.nullable(),
    eliminated: z.array(
      z
        .object({
          role: tankRoleSchema,
          round: roundNumber,
          cause: eliminationCauseSchema,
        })
        .strict(),
    ),
    outcome: z
      .object({
        winnerRoles: z.array(tankRoleSchema),
        draw: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TankArenaState = z.infer<typeof tankArenaStateSchema>;

export const tankArenaMoveSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("select"),
      round: z.literal(0),
      tank: tankKindSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("lock"),
      round: playRound,
      action: tankActionSchema,
      angle: tankAngleSchema,
      power: tankPowerSchema,
    })
    .strict(),
  z.object({ type: z.literal("forfeit"), round: roundNumber }).strict(),
]);
export type TankArenaMove = z.infer<typeof tankArenaMoveSchema>;

export const tankArenaConfigSchema = lobbyConfigSchema;
export type TankArenaConfig = z.infer<typeof tankArenaConfigSchema>;
