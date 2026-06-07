import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dir, "..", "app");

const ROUTES_WITH_LOADING = [
  "play/[gameId]",
  "chat",
  "chat/[handle]",
  "games/[gameType]",
  "friends",
  "settings",
  "profile",
  "[username]",
];

describe("key route directories ship a loading skeleton", () => {
  for (const route of ROUTES_WITH_LOADING) {
    test(`${route} has a loading.tsx`, () => {
      const loadingPath = join(APP_DIR, route, "loading.tsx");
      expect(existsSync(loadingPath)).toBe(true);
    });
  }
});
