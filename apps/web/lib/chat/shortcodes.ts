export function replaceShortcodeBeforeSpace(
  value: string,
  caret: number,
  lookup: (code: string) => string | undefined,
): { value: string; caret: number } | null {
  if (value[caret - 1] !== " ") return null;
  const head = value.slice(0, caret - 1);
  const match = head.match(/(?:^|\s):([a-z0-9_+-]+)$/i);
  const token = match?.[1];
  if (!token) return null;
  const code = token.toLowerCase();
  const native = lookup(code);
  if (!native) return null;
  const tokenStart = caret - 1 - (token.length + 1);
  const next = value.slice(0, tokenStart) + native + value.slice(caret - 1);
  return { value: next, caret: tokenStart + native.length + 1 };
}
