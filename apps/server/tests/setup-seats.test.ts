import { describe, expect, test } from "bun:test";
import { getDefinition } from "@kyzen/games-core";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameDefinition } from "@kyzen/shared/types";
import {
  botDifficulty,
  lobbySeats,
  lobbySettings,
  publicGroupSize,
  publicSeats,
} from "../src/realtime/setup";
import { fakeRoundsDefinition } from "./support/fake-rounds";

const engine = fakeRoundsDefinition.engine;
const humans = [
  { userId: "h1", username: "one", role: "P1" },
  { userId: "h2", username: "two", role: "P2" },
];

describe("public matchmaking seats", () => {
  test("group size comes from playerCount, defaulting to two", () => {
    expect(publicGroupSize(fakeRoundsDefinition, { mode: "duel" })).toBe(2);
    expect(publicGroupSize(fakeRoundsDefinition, { mode: "teams" })).toBe(4);
    expect(publicGroupSize(getDefinition(TIC_TAC_TOE), {})).toBe(2);
  });

  test("group sizes outside the engine bounds or without reduce are unsupported", () => {
    const oversized = {
      ...fakeRoundsDefinition,
      engine: { ...engine, playerCount: () => 9 },
    } as GameDefinition;
    const fractional = {
      ...fakeRoundsDefinition,
      engine: { ...engine, playerCount: () => 2.5 },
    } as GameDefinition;
    const realtime = {
      ...fakeRoundsDefinition,
      engine: { ...engine, mode: "realtime" },
    } as GameDefinition;
    expect(publicGroupSize(oversized, {})).toBeNull();
    expect(publicGroupSize(fractional, {})).toBeNull();
    expect(publicGroupSize(realtime, {})).toBeNull();
  });

  test("teams alternate A/B by seat in teams mode and are per-seat otherwise", () => {
    expect(publicSeats(engine, 4, { mode: "teams" })).toEqual([
      { role: "P1", team: "A", bot: null },
      { role: "P2", team: "B", bot: null },
      { role: "P3", team: "A", bot: null },
      { role: "P4", team: "B", bot: null },
    ]);
    expect(publicSeats(engine, 2, { mode: "duel" })).toEqual([
      { role: "P1", team: "P1", bot: null },
      { role: "P2", team: "P2", bot: null },
    ]);
  });
});

describe("lobby seats", () => {
  test("lobby settings fall back to free-for-all without bots", () => {
    expect(lobbySettings(null)).toEqual({ mode: "ffa", teams: {}, bots: [] });
    expect(lobbySettings({ rounds: 3, mode: "teams" })).toEqual({
      mode: "teams",
      teams: {},
      bots: [],
    });
  });

  test("humans come first, then bots in config order", () => {
    const { seats, bots } = lobbySeats(
      engine,
      humans,
      lobbySettings({
        mode: "ffa",
        bots: [
          { id: "bot:7", difficulty: "normal", team: "A" },
          { id: "bot:3", difficulty: "hard", team: "B" },
          { id: "bot:4", difficulty: "hard", team: "B" },
        ],
      }),
    );
    expect(seats).toEqual([
      { role: "P1", team: "P1", bot: null },
      { role: "P2", team: "P2", bot: null },
      { role: "P3", team: "P3", bot: "normal" },
      { role: "P4", team: "P4", bot: "hard" },
      { role: "P5", team: "P5", bot: "hard" },
    ]);
    expect(bots).toEqual([
      { userId: "bot:7", username: "Bot 1 (Normal)", role: "P3" },
      { userId: "bot:3", username: "Bot 2 (Hard)", role: "P4" },
      { userId: "bot:4", username: "Bot 3 (Hard)", role: "P5" },
    ]);
  });

  test("bot difficulty is read from the lobby config", () => {
    const config = {
      bots: [{ id: "bot:1", difficulty: "easy", team: "A" }],
    };
    expect(botDifficulty(config, "bot:1")).toBe("easy");
    expect(botDifficulty(config, "bot:9")).toBe("normal");
    expect(botDifficulty(config, "h1")).toBeNull();
  });
});
