import { ObjectId } from "mongodb";

import { ensureMongoConnected, getMongoDb } from "@/database";

export type AuthUserName = {
  name: string | null;
};

/**
 * Loads display name from Better Auth's Mongo `user` collection.
 */
export async function findAuthUserDisplayName(
  userId: string,
): Promise<AuthUserName | null> {
  await ensureMongoConnected();
  const db = getMongoDb();
  const coll = db.collection("user");
  const or: Record<string, unknown>[] = [{ id: userId }];
  if (ObjectId.isValid(userId)) {
    try {
      or.push({ _id: new ObjectId(userId) });
    } catch {
      /* ignore */
    }
  }
  const doc = await coll.findOne<{ name?: string | null }>(
    { $or: or },
    { projection: { name: 1 } },
  );
  if (!doc) return null;
  return {
    name: typeof doc.name === "string" ? doc.name : null,
  };
}
