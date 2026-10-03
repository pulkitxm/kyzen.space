import { z } from "zod";

const vectorSchema = z
  .object({ x: z.number(), y: z.number(), z: z.number() })
  .strict();
const teamSchema = z.enum(["blue", "orange"]);
const phaseSchema = z.enum(["kickoff", "play", "goal", "overtime", "finished"]);

const carFootballCarSchema = z
  .object({
    role: z.string(),
    team: teamSchema,
    position: vectorSchema,
    velocity: vectorSchema,
    yaw: z.number(),
    boost: z.number().min(0).max(100),
    grounded: z.boolean(),
    jumpHeld: z.boolean(),
  })
  .strict();

export const carFootballStateSchema = z
  .object({
    phase: phaseSchema,
    timeRemaining: z.number().min(0),
    pauseRemaining: z.number().min(0),
    score: z
      .object({
        blue: z.number().int().nonnegative(),
        orange: z.number().int().nonnegative(),
      })
      .strict(),
    lastScorer: teamSchema.nullable(),
    ball: z.object({ position: vectorSchema, velocity: vectorSchema }).strict(),
    cars: z.array(carFootballCarSchema).length(4),
  })
  .strict();

export const carFootballMoveSchema = z
  .object({
    throttle: z.number().min(-1).max(1),
    steer: z.number().min(-1).max(1),
    jump: z.boolean(),
    boost: z.boolean(),
    handbrake: z.boolean(),
  })
  .strict();

export const carFootballConfigSchema = z.object({}).strict();

export type CarFootballState = z.infer<typeof carFootballStateSchema>;
export type CarFootballMove = z.infer<typeof carFootballMoveSchema>;
export type CarFootballConfig = z.infer<typeof carFootballConfigSchema>;
export type CarFootballTeam = z.infer<typeof teamSchema>;
