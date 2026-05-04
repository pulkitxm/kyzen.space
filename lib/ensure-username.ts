import { UserProfile } from "@/database/models";

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
  const existing = await UserProfile.findOne({ userId });
  if (existing) return existing.username;

  const base = slugifyBase(displayName ?? "player");
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const taken = await UserProfile.exists({ username: candidate });
    if (!taken) {
      await UserProfile.create({ userId, username: candidate, stats: new Map() });
      return candidate;
    }
    candidate = `${base}_${randomSuffix()}`;
  }
  candidate = `player_${randomSuffix()}`;
  await UserProfile.create({ userId, username: candidate, stats: new Map() });
  return candidate;
}
