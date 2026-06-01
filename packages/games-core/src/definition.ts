import type { ZodType } from "zod";
import type { GameEngine } from "./engine";

/**
 * Catalog metadata for a game. The `type` is the single id used everywhere
 * (registry key, `game_type` column, `/games/${type}` URL, socket payloads).
 */
export interface GameMeta {
  type: string;
  name: string;
  description: string;
  categoryId: string;
  coverImage?: string;
}

/**
 * A declarative setup input shown in the shared lobby between "Play" and
 * "Play with…". The collected values become the game's `config` (validated by
 * `configSchema`). Games with no setup leave `configFields` empty.
 */
export type ConfigFieldType = "select" | "number" | "toggle";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: unknown;
  /** Required for `type: "select"`. */
  options?: { value: string; label: string }[];
  /** Bounds for `type: "number"`. */
  min?: number;
  max?: number;
}

/**
 * The single, self-describing unit of "a game". Everything generic in the
 * platform (driver, serializers, DB guardrails, lobby, conformance tests)
 * reads a game purely through this object — there are no per-game branches
 * anywhere outside the game's own folder. Adding a game = adding one of these
 * to the `GAMES` array (+ a matching client component in `@gamelobby/games-client`).
 *
 * The Zod schemas make the otherwise-opaque JSONB columns strongly typed and
 * runtime-validated; the engine's `State`/`Input` types are derived from them.
 */
export interface GameDefinition<S = unknown, I = unknown, C = unknown> {
  meta: GameMeta;
  engine: GameEngine<S, I>;
  /** Validates the stored `game.game_state` JSONB. */
  stateSchema: ZodType<S>;
  /** Validates `move.move_data` JSONB and the inbound `make_move` payload. */
  moveSchema: ZodType<I>;
  /** Validates the stored `game.config` JSONB and the lobby's setup form. */
  configSchema: ZodType<C>;
  /** Setup inputs rendered by the shared lobby; empty when there is none. */
  configFields?: ConfigField[];
}
