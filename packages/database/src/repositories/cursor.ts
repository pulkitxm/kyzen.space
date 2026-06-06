export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${new Date(createdAt).toISOString()}|${id}`).toString(
    "base64",
  );
}

export function decodeCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64").toString("utf8").split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
