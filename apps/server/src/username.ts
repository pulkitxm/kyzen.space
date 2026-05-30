import { randomAvatarConfig } from "@gamelobby/avatar";
import {
  createProfile,
  getProfileByUserId,
  isUsernameTaken,
} from "./db/repositories/profiles";

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
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    if (!(await isUsernameTaken(candidate))) {
      try {
        const profile = await createProfile({
          userId,
          username: candidate,
          avatar,
        });
        return profile.username;
      } catch {}
    }
    candidate = `${base}_${randomSuffix()}`;
  }
  candidate = `player_${randomSuffix()}`;
  const profile = await createProfile({
    userId,
    username: candidate,
    avatar,
  });
  return profile.username;
}
