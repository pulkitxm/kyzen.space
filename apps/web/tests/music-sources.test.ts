import { describe, expect, test } from "bun:test";
import { getDefinition } from "@kyzen/games-core";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { gameMusicSource } from "../lib/audio/music-sources";

describe("game background music", () => {
  test("uses the registered game's metadata", () => {
    expect(gameMusicSource(TIC_TAC_TOE)).toBe(
      getDefinition(TIC_TAC_TOE).meta.backgroundMusic ?? null,
    );
    expect(gameMusicSource(TIC_TAC_TOE)).toBe("/sounds/tic-tac-toe-bg.ogg");
  });

  test("unknown and inherited keys do not resolve to music", () => {
    for (const type of ["unknown", "constructor", "toString", "__proto__"]) {
      expect(gameMusicSource(type)).toBeNull();
    }
  });
});
