export type ArenaStats = {
  rating: number;
  rank: string;
  streak: number;
  winRate: number;
};

const RANKS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
] as const;

export const REACTION_EMOJIS = [
  "🔥",
  "👏",
  "😎",
  "🎯",
  "🧠",
  "🤝",
  "😅",
  "💀",
] as const;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function arenaStats(seed: string): ArenaStats {
  const h = hash(seed || "player");
  const rating = 820 + (h % 1780);
  const rank =
    RANKS[Math.min(RANKS.length - 1, Math.floor(rating / 450))] ?? "Champion";
  const streak = (h >>> 3) % 9;
  const winRate = 41 + ((h >>> 7) % 55);
  return { rating, rank, streak, winRate };
}

export function spectatorCount(seed: string): number {
  return 2 + (hash(`spec-${seed}`) % 86);
}

export function friendWatchers(seed: string, count = 4): string[] {
  const n = 2 + (hash(`watch-${seed}`) % Math.max(1, count - 1));
  return Array.from({ length: n }, (_, i) => `watch-${seed}-${i}`);
}

export type MatchSummaryStats = {
  result: "win" | "loss" | "draw";
  xpGain: number;
  xpInto: number;
  xpLevel: number;
  ratingDelta: number;
  streak: number;
  achievements: string[];
};

export function matchSummary(
  seed: string,
  result: "win" | "loss" | "draw",
): MatchSummaryStats {
  const h = hash(`summary-${seed}-${result}`);
  const xpGain = result === "win" ? 70 + (h % 60) : 18 + (h % 26);
  const ratingDelta =
    result === "win" ? 16 + (h % 18) : result === "loss" ? -(11 + (h % 14)) : 2;
  const streak = result === "win" ? 1 + ((h >>> 4) % 6) : 0;
  const xpInto = h % 100;
  const xpLevel = 4 + ((h >>> 9) % 36);
  const pool =
    result === "win"
      ? ["First Blood", "Flawless", "On Fire", "Sharpshooter", "Tactician"]
      : ["Good Game", "Comeback Soon", "Worthy Rival"];
  const achievements = pool.slice(0, 1 + ((h >>> 11) % 2));
  return { result, xpGain, xpInto, xpLevel, ratingDelta, streak, achievements };
}
