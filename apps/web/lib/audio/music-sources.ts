import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const GAME_MUSIC_SOURCES: Record<string, string> = {
  [TIC_TAC_TOE]: "/sounds/tic-tac-toe-bg.mp3",
};

export function gameMusicSource(gameType: string): string | null {
  return GAME_MUSIC_SOURCES[gameType] ?? null;
}
