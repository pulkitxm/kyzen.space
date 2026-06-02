import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listGameTypes } from "../src/index";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const gameDocsDir = join(repoRoot, "docs", "games");

function docPathFor(type: string): string {
  return join(gameDocsDir, `${type}.md`);
}

describe("per-game documentation convention", () => {
  test("repo root resolves to a real repository", () => {
    expect(existsSync(join(repoRoot, "package.json"))).toBe(true);
    expect(existsSync(gameDocsDir)).toBe(true);
    expect(existsSync(join(gameDocsDir, "README.md"))).toBe(true);
  });

  test("there is at least one game to document", () => {
    expect(listGameTypes().length).toBeGreaterThan(0);
  });

  for (const type of listGameTypes()) {
    test(`${type} ships docs/games/${type}.md`, () => {
      expect(existsSync(docPathFor(type))).toBe(true);
    });
  }
});
