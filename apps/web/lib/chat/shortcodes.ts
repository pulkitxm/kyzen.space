export function replaceShortcodeBeforeSpace(
  value: string,
  caret: number,
  lookup: (code: string) => string | undefined,
): { value: string; caret: number } | null {
  if (value[caret - 1] !== " ") return null;
  const head = value.slice(0, caret - 1);
  const match = head.match(/(?:^|\s):([a-z0-9_+-]+)$/i);
  if (!match) return null;
  const code = match[1]!.toLowerCase();
  const native = lookup(code);
  if (!native) return null;
  const tokenStart = caret - 1 - (match[1]!.length + 1);
  const next = value.slice(0, tokenStart) + native + value.slice(caret - 1);
  return { value: next, caret: tokenStart + native.length + 1 };
}
