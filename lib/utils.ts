export function formatTs(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function shortenId(id: string) {
  return id.slice(0, 8);
}

export function displayName(user: {
  name?: string | null;
  email?: string | null;
}): string | null {
  if (typeof user.name === "string" && user.name.trim()) return user.name.trim();
  if (typeof user.email === "string" && user.email.trim())
    return user.email.trim();
  return null;
}
