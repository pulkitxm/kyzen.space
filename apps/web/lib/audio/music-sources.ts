import { TIC_TAC_TOE } from "@kyzen/shared/constants";

const GAME_MUSIC_SOURCES: Record<string, string> = {
  [TIC_TAC_TOE]: "/sounds/tic-tac-toe-bg.ogg",
};

export function gameMusicSource(gameType: string): string | null {
  return GAME_MUSIC_SOURCES[gameType] ?? null;
}
