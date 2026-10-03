import { describe, expect, it } from "bun:test";
import { type LobbyConfig, lobbyConfigSchema } from "@kyzen/shared/types";
import {
  addBot,
  assignTeam,
  lobbyConfigPayload,
  lobbyTeams,
  readLobbyConfig,
  removeBot,
  setBotDifficulty,
  startBlocker,
  suggestedTeam,
  teamLetters,
  withMode,
} from "@/lib/games/lobby-config";

const empty: LobbyConfig = { mode: "ffa", teams: {}, bots: [] };
const humans = ["u1", "u2", "u3"];
const limits = { minPlayers: 2, maxPlayers: 4 };

describe("lobby config helpers", () => {
  it("reads defaults from missing or invalid configs", () => {
    expect(readLobbyConfig(null)).toEqual(empty);
    expect(readLobbyConfig({ mode: "chaos" })).toEqual(empty);
    expect(readLobbyConfig({ mode: "teams", map: "dunes" })).toEqual({
      ...empty,
      mode: "teams",
    });
  });

  it("keeps engine specific keys when building the payload", () => {
    const next = addBot(empty, "easy", "A");
    expect(lobbyConfigPayload({ map: "dunes", mode: "ffa" }, next)).toEqual({
      map: "dunes",
      ...next,
    });
    expect(() =>
      lobbyConfigPayload(null, {
        ...empty,
        bots: [
          { id: "bot:1", difficulty: "easy", team: "A" },
          { id: "bot:1", difficulty: "hard", team: "B" },
        ],
      }),
    ).toThrow();
  });

  it("offers enough team letters for every participant", () => {
    expect(teamLetters(0)).toEqual(["A", "B"]);
    expect(teamLetters(4)).toEqual(["A", "B", "C", "D"]);
    expect(teamLetters(40)).toHaveLength(26);
  });

  it("balances unassigned players between teams A and B", () => {
    const config: LobbyConfig = {
      mode: "teams",
      teams: { u1: "A" },
      bots: [{ id: "bot:1", difficulty: "normal", team: "A" }],
    };
    const teams = lobbyTeams(config, humans);
    expect(teams.get("u2")).toBe("B");
    expect(teams.get("u3")).toBe("B");
    expect(suggestedTeam(config, humans)).toBe("A");
    expect(suggestedTeam(config, ["u1", "u2"])).toBe("B");
    expect(suggestedTeam(empty, [])).toBe("A");
  });

  it("materializes balanced teams when switching to teams mode", () => {
    const teamsMode = withMode(empty, "teams", humans);
    expect(teamsMode.mode).toBe("teams");
    expect(teamsMode.teams).toEqual({ u1: "A", u2: "B", u3: "A" });
    expect(lobbyConfigSchema.safeParse(teamsMode).success).toBe(true);
    expect(withMode(teamsMode, "ffa", humans)).toEqual({
      ...teamsMode,
      mode: "ffa",
    });
  });

  it("assigns teams to humans and bots", () => {
    const withBot = addBot(withMode(empty, "teams", humans), "hard", "A");
    const moved = assignTeam(withBot, "u2", "C", humans);
    expect(moved.teams.u2).toBe("C");
    const botMoved = assignTeam(moved, "bot:1", "B", humans);
    expect(botMoved.bots).toEqual([
      { id: "bot:1", difficulty: "hard", team: "B" },
    ]);
    expect(botMoved.teams).toEqual({ u1: "A", u2: "C", u3: "A" });
  });

  it("adds, edits, and removes bots with unique ids", () => {
    const one = addBot(empty, "easy", "A");
    const two = addBot(one, "normal", "B");
    expect(two.bots.map((bot) => bot.id)).toEqual(["bot:1", "bot:2"]);
    const refilled = addBot(removeBot(two, "bot:1"), "hard", "A");
    expect(refilled.bots.map((bot) => bot.id)).toEqual(["bot:2", "bot:1"]);
    expect(setBotDifficulty(two, "bot:2", "hard").bots[1]?.difficulty).toBe(
      "hard",
    );
    expect(lobbyConfigSchema.safeParse(refilled).success).toBe(true);
  });

  it("explains what blocks the start", () => {
    expect(startBlocker(empty, ["u1"], limits)).toBe(
      "Needs at least 2 players",
    );
    expect(startBlocker(addBot(empty, "easy", "A"), ["u1"], limits)).toBe(null);
    const crowded = addBot(addBot(empty, "easy", "A"), "easy", "B");
    expect(startBlocker(crowded, humans, limits)).toBe(
      "Allows at most 4 players",
    );
    const oneTeam: LobbyConfig = {
      mode: "teams",
      teams: { u1: "A", u2: "A" },
      bots: [],
    };
    expect(startBlocker(oneTeam, ["u1", "u2"], limits)).toBe(
      "Teams mode needs at least two teams",
    );
    expect(
      startBlocker(empty, ["u1", "u2"], {
        minPlayers: 2,
        maxPlayers: Number.POSITIVE_INFINITY,
      }),
    ).toBe(null);
  });
});
