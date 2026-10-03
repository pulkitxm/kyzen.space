import { z } from "zod";
import { botDifficultySchema, lobbyConfigSchema } from "../lobby";

export const TANK_ARENA_MAX_ROUND = 40;
export const TANK_ARENA_MAX_SEATS = 256;

const MAX_MODULES = TANK_ARENA_MAX_SEATS / 2;
const MAX_ITEMS = 4096;
const MAX_COLUMNS = 2 * (3 + MAX_MODULES);
const MAX_COOLDOWN = 8;
const MAX_HP = 160;
const MAX_STEPS = 900;

const coordinate = z.number().finite().min(-100_000).max(100_000);
const velocity = z.number().finite().min(-10_000).max(10_000);
const itemId = z.number().int().min(0).max(1_000_000);
const roundNumber = z.number().int().min(0).max(TANK_ARENA_MAX_ROUND);
const playRound = z.number().int().min(1).max(TANK_ARENA_MAX_ROUND);

export const tankRoleSchema = z.string().regex(/^p[1-9]\d{0,2}$/);
const tankTeamSchema = z.string().regex(/^([A-Z]|p[1-9]\d{0,2})$/);

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
    columns: z.array(coordinate).min(1).max(MAX_COLUMNS),
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
    tanks: z.array(tankSchema).max(TANK_ARENA_MAX_SEATS),
    pickups: z.array(pickupSchema).max(MAX_ITEMS),
    mines: z.array(mineSchema).max(MAX_ITEMS),
    airstrike: airstrikeSchema.nullable(),
  })
  .strict();
export type TankArenaSnapshot = z.infer<typeof snapshotSchema>;

const resolutionSchema = z
  .object({
    round: playRound,
    steps: z.number().int().min(1).max(MAX_STEPS),
    before: snapshotSchema,
    plans: z.record(tankRoleSchema, planSchema),
    damage: z
      .array(
        z
          .object({
            role: tankRoleSchema,
            amount: z.number().int().min(0).max(100_000),
          })
          .strict(),
      )
      .max(TANK_ARENA_MAX_SEATS),
    collected: z
      .array(
        z.object({ role: tankRoleSchema, kind: tankPickupKindSchema }).strict(),
      )
      .max(MAX_ITEMS),
    eliminated: z
      .array(
        z
          .object({ role: tankRoleSchema, cause: eliminationCauseSchema })
          .strict(),
      )
      .max(TANK_ARENA_MAX_SEATS),
  })
  .strict();
export type TankArenaResolution = z.infer<typeof resolutionSchema>;

export const tankArenaStateSchema = z
  .object({
    version: z.literal(1),
    seed: z.number().int().min(0).max(4_294_967_295),
    round: roundNumber,
    phase: z.enum(["select", "plan", "finished"]),
    modules: z.number().int().min(2).max(MAX_MODULES),
    seats: z.array(seatSchema).min(1).max(TANK_ARENA_MAX_SEATS),
    tanks: z.array(tankSchema).min(1).max(TANK_ARENA_MAX_SEATS),
    pickups: z.array(pickupSchema).max(MAX_ITEMS),
    mines: z.array(mineSchema).max(MAX_ITEMS),
    nextId: itemId,
    airstrike: airstrikeSchema.nullable(),
    submitted: z.array(tankRoleSchema).max(TANK_ARENA_MAX_SEATS),
    plans: z.record(tankRoleSchema, planSchema),
    resolution: resolutionSchema.nullable(),
    eliminated: z
      .array(
        z
          .object({
            role: tankRoleSchema,
            round: roundNumber,
            cause: eliminationCauseSchema,
          })
          .strict(),
      )
      .max(TANK_ARENA_MAX_SEATS),
    outcome: z
      .object({
        winnerRoles: z.array(tankRoleSchema).max(TANK_ARENA_MAX_SEATS),
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
