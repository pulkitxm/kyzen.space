import { describe, expect, test } from "bun:test";
import { replaceShortcodeBeforeSpace } from "../lib/chat/shortcodes";

const lookup = (c: string): string | undefined =>
  ({ joy: "😂", heart: "❤️" })[c];

describe("replaceShortcodeBeforeSpace", () => {
  test("replaces :code + space with the emoji, keeping the space", () => {
    const r = replaceShortcodeBeforeSpace("hi :joy ", 8, lookup);
    expect(r?.value).toBe("hi 😂 ");
    expect(r?.caret).toBe("hi 😂 ".length);
  });

  test("works at the very start of the input", () => {
    const r = replaceShortcodeBeforeSpace(":heart ", 7, lookup);
    expect(r?.value).toBe("❤️ ");
  });

  test("only triggers once the trailing space is typed", () => {
    expect(replaceShortcodeBeforeSpace("hi :joy", 7, lookup)).toBeNull();
  });

  test("requires whitespace/start before the colon (not mid-word)", () => {
    expect(replaceShortcodeBeforeSpace("foo:joy ", 8, lookup)).toBeNull();
  });

  test("leaves unknown codes untouched", () => {
    expect(replaceShortcodeBeforeSpace("hi :nope ", 9, lookup)).toBeNull();
  });

  test("does not replace when the caret isn't after a space", () => {
    expect(replaceShortcodeBeforeSpace("hi :joy x", 9, lookup)).toBeNull();
  });
});
