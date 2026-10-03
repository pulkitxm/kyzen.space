import type { ZodType } from "zod";
import type { GameCategoryId } from "./categories";
import type { GameType } from "./core";
import type { GameEngine } from "./engine";

export interface GameMeta {
  type: GameType;
  name: string;
  description: string;
  categoryId: GameCategoryId;
  coverImage?: string;
  tutorialVideo?: string;
  backgroundMusic?: string;
  howToPlay?: string[];
}

export type ConfigFieldType = "select" | "number" | "toggle";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface PublicQueue {
  id: string;
  label: string;
  description: string;
  config: unknown;
}

export interface GameDefinition<S = unknown, I = unknown, C = unknown> {
  meta: GameMeta;
  engine: GameEngine<S, I>;
  stateSchema: ZodType<S>;
  moveSchema: ZodType<I>;
  configSchema: ZodType<C>;
  configFields?: ConfigField[];
  queues?: PublicQueue[];
  layout?: "standard" | "wide";
}
