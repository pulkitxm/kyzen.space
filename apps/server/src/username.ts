import { randomAvatarConfig } from "@gamelobby/avatar";
import {
  createProfile,
  getProfileByUserId,
  getTakenUsernames,
} from "./db/repositories/profiles";

const CANDIDATE_COUNT = 20;
const BATCH_SIZE = 5;

function slugifyBase(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30) || "player"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function ensureUsernameForUser(
  userId: string,
  displayName: string | null | undefined,
): Promise<string> {
  const existing = await getProfileByUserId(userId);
  if (existing) return existing.username;

  const avatar = randomAvatarConfig(userId);
  const base = slugifyBase(displayName ?? "player");
  const candidates = [
    base,
    ...Array.from(
      { length: CANDIDATE_COUNT - 1 },
      () => `${base}_${randomSuffix()}`,
    ),
  ];

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const taken = await getTakenUsernames(batch);
    for (const candidate of batch) {
      if (taken.has(candidate.toLowerCase())) continue;
      try {
        const profile = await createProfile({
          userId,
          username: candidate,
          avatar,
        });
        return profile.username;
      } catch {}
    }
  }

  const fallback = `player_${randomSuffix()}`;
  const profile = await createProfile({
    userId,
    username: fallback,
    avatar,
  });
  return profile.username;
}
