/**
 * WhatsApp-style shortcode replacement: when a space is typed right after a
 * `:code` token, replace `:code` with its emoji. `caret` is the cursor position
 * (just after the space). Returns the new value + caret, or null if nothing
 * matched. Pure + testable.
 */
export function replaceShortcodeBeforeSpace(
  value: string,
  caret: number,
  lookup: (code: string) => string | undefined,
): { value: string; caret: number } | null {
  if (value[caret - 1] !== " ") return null;
  const head = value.slice(0, caret - 1); // text before the just-typed space
  const match = head.match(/(?:^|\s):([a-z0-9_+-]+)$/i);
  if (!match) return null;
  const code = match[1]!.toLowerCase();
  const native = lookup(code);
  if (!native) return null;
  const tokenStart = caret - 1 - (match[1]!.length + 1); // index of the ':'
  const next = value.slice(0, tokenStart) + native + value.slice(caret - 1);
  return { value: next, caret: tokenStart + native.length + 1 };
}
