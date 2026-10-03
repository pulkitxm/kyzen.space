import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  avatarConfigSchema,
  gameCardMetaSchema,
  gameResultLabel,
} from "../src/types";

const base = {
  gameId: "K7P2QX",
  gameType: TIC_TAC_TOE,
  seatingMode: "open" as const,
  creatorUsername: "aman",
};

const SAMPLE_AVATAR = {
  skinColor: "edb98a",
  top: "shortFlat",
  hairColor: "2c1b18",
  hatColor: "3c4f5c",
  accessories: "none",
  accessoriesColor: "000000",
  facialHair: "none",
  facialHairColor: "2c1b18",
  clothing: "shirtCrewNeck",
  clothesColor: "3c4f5c",
  eyes: "default",
  eyebrows: "default",
  mouth: "smile",
  backgroundColor: "b6e3f4",
};

describe("gameCardMetaSchema durable fields", () => {
  test("rejects an empty gameId (.min(1))", () => {
    expect(gameCardMetaSchema.safeParse({ ...base, gameId: "" }).success).toBe(
      false,
    );
  });

  test("rejects an unknown gameType via the registry", () => {
    expect(
      gameCardMetaSchema.safeParse({ ...base, gameType: "chess" }).success,
    ).toBe(false);
  });

  test("rejects an unknown seatingMode enum", () => {
    expect(
      gameCardMetaSchema.safeParse({ ...base, seatingMode: "ranked" }).success,
    ).toBe(false);
  });

  test("accepts a challenge seatingMode with a null challengedUserId", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        seatingMode: "challenge",
        challengedUserId: null,
      }).success,
    ).toBe(true);
  });

  test("rejects a missing creatorUsername", () => {
    const { creatorUsername: _drop, ...partial } = base;
    expect(gameCardMetaSchema.safeParse(partial).success).toBe(false);
  });
});

describe("gameCardMetaSchema live fields", () => {
  test("accepts a recomputed status, winner, and winners", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        status: "completed",
        winner: "u1",
        winners: ["u1"],
      }).success,
    ).toBe(true);
  });

  test("accepts a null winner with several winners (team result)", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        winner: null,
        winners: ["u1", "bot:1"],
      }).success,
    ).toBe(true);
  });

  test("rejects an empty winner id", () => {
    expect(
      gameCardMetaSchema.safeParse({ ...base, winners: [""] }).success,
    ).toBe(false);
  });

  test("rejects the removed winnerUsername field", () => {
    expect(
      gameCardMetaSchema.safeParse({ ...base, winnerUsername: "aman" }).success,
    ).toBe(false);
  });

  test("accepts a valid players array", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        players: [{ userId: "u1", username: "aman", role: "X" }],
      }).success,
    ).toBe(true);
  });

  test("rejects a player with an empty field (gameCardPlayerSchema .min(1))", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        players: [{ userId: "", username: "aman", role: "X" }],
      }).success,
    ).toBe(false);
  });

  test("rejects a player carrying an extra key (gameCardPlayerSchema is strict)", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        players: [{ userId: "u1", username: "aman", role: "X", avatar: null }],
      }).success,
    ).toBe(false);
  });

  test("rejects a non-boolean seriesSuperseded", () => {
    expect(
      gameCardMetaSchema.safeParse({ ...base, seriesSuperseded: "yes" })
        .success,
    ).toBe(false);
  });
});

describe("gameResultLabel", () => {
  const players = [
    { userId: "u1", username: "aman", role: "p1" },
    { userId: "u2", username: "bina", role: "p2" },
    { userId: "u3", username: "chet", role: "p3" },
    { userId: "bot:1", username: "Normal Bot", role: "p4" },
  ];

  test("names a single winner", () => {
    expect(
      gameResultLabel({
        status: "completed",
        winner: "u2",
        winners: ["u2"],
        players,
      }),
    ).toBe("bina won");
  });

  test("names every member of a winning team, bots included", () => {
    expect(
      gameResultLabel({
        status: "completed",
        winner: null,
        winners: ["u2", "bot:1"],
        players,
      }),
    ).toBe("bina and Normal Bot won");
  });

  test("lists any number of winners", () => {
    expect(
      gameResultLabel({
        status: "completed",
        winner: null,
        winners: ["u1", "u2", "u3", "bot:1"],
        players,
      }),
    ).toBe("aman, bina, chet, and Normal Bot won");
  });

  test("reports a draw even when drawing teams are listed", () => {
    expect(
      gameResultLabel({
        status: "completed",
        winner: "draw",
        winners: ["u1", "u2"],
        players,
      }),
    ).toBe("Draw");
  });

  test("falls back to the single winner when winners is empty", () => {
    expect(
      gameResultLabel({ status: "completed", winner: "u1", players }),
    ).toBe("aman won");
  });

  test("names the attentive players of an aborted game", () => {
    expect(
      gameResultLabel({
        status: "aborted",
        winner: null,
        winners: ["u1", "u3"],
        players,
      }),
    ).toBe("aman and chet won");
  });

  test("says the game is over when nobody won", () => {
    expect(
      gameResultLabel({
        status: "aborted",
        winner: null,
        winners: [],
        players,
      }),
    ).toBe("Game over");
  });

  test("skips winner ids that are not seated", () => {
    expect(
      gameResultLabel({
        status: "completed",
        winner: null,
        winners: ["ghost", "u1"],
        players,
      }),
    ).toBe("aman won");
  });

  test("returns null while the game is live", () => {
    expect(gameResultLabel({ status: "active", winner: null, players })).toBe(
      null,
    );
    expect(gameResultLabel({})).toBe(null);
  });
});

describe("avatarConfigSchema is not strict", () => {
  test("passes through an unknown extra key (documents non-strict behavior)", () => {
    expect(
      avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, extra: "anything" })
        .success,
    ).toBe(true);
  });

  test("rejects a non-string value on a required field", () => {
    expect(
      avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, skinColor: 123 })
        .success,
    ).toBe(false);
  });

  test("accepts each valid style and rejects an unknown one", () => {
    for (const style of ["feminine", "masculine", "any"]) {
      expect(
        avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, style }).success,
      ).toBe(true);
    }
    expect(
      avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, style: "wizard" })
        .success,
    ).toBe(false);
  });
});
