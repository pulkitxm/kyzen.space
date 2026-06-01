import { z } from "zod";

/**
 * Strict Zod schemas for the chat DTOs that cross the wire or live in JSONB
 * columns. Types are derived via `z.infer` (see dto.ts / socket-events.ts) so
 * the schema is the single source of truth for runtime validation AND types.
 */

const gameCardPlayerSchema = z
  .object({
    userId: z.string().min(1),
    username: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();

/** Render snapshot stored on a `kind: "game_card"` message. Trailing fields are
 *  resolved server-side from the live game (see enrichGameCardMeta). */
export const gameCardMetaSchema = z
  .object({
    gameId: z.string().min(1),
    gameType: z.string().min(1),
    seatingMode: z.enum(["open", "challenge"]),
    challengedUserId: z.string().nullable().optional(),
    creatorUsername: z.string(),
    status: z.string().optional(),
    winner: z.string().nullable().optional(),
    winnerUsername: z.string().nullable().optional(),
    players: z.array(gameCardPlayerSchema).optional(),
  })
  .strict();

export const notificationPayloadSchema = z.object({
  conversationId: z.string().optional(),
  gameId: z.string().optional(),
  gameType: z.string().optional(),
  requestId: z.string().optional(),
});

/** Inbound `game:create_in_conversation` payload. `config` is per-game and is
 *  validated against the game's own `configSchema` on the server. */
export const clientCreateGameInConversationSchema = z
  .object({
    conversationId: z.string().min(1),
    gameType: z.string().min(1),
    /** Required for groups; ignored for DMs (always "open"). */
    seatingMode: z.enum(["open", "challenge"]).optional(),
    /** When seatingMode is "challenge", the member who must take the second seat. */
    challengedUserId: z.string().nullable().optional(),
    /** Optional per-game setup values from the lobby. */
    config: z.unknown().optional(),
  })
  .strict();
