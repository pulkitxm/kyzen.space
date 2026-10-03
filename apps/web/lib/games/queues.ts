import { getDefinition, hasEngine } from "@kyzen/games-core";
import type {
  ClientQueueJoin,
  GameJson,
  GameType,
  PublicQueue,
} from "@kyzen/shared/types";

export function initialQueueId(
  queues: readonly PublicQueue[],
  requested: string | null,
): string | null {
  if (queues.length === 1) return queues[0]?.id ?? null;
  return queues.some((queue) => queue.id === requested) ? requested : null;
}

export function queueJoinPayload(
  gameType: GameType,
  queue: PublicQueue | null,
): ClientQueueJoin {
  return queue ? { gameType, config: queue.config } : { gameType };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export function findMatchHref(
  game: Pick<GameJson, "gameType" | "config">,
): string {
  const href = `/play/find/${game.gameType}`;
  if (!hasEngine(game.gameType)) return href;
  const { queues, configSchema } = getDefinition(game.gameType);
  const normalize = (config: unknown) => {
    const parsed = configSchema.safeParse(config);
    return canonical(parsed.success ? parsed.data : config);
  };
  const played = normalize(game.config);
  const queue = queues?.find((entry) => normalize(entry.config) === played);
  return queue ? `${href}?queue=${encodeURIComponent(queue.id)}` : href;
}
