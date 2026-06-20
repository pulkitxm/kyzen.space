import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import { avatarConfigSchema, gameCardMetaSchema } from "../src/types";

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
  test("accepts a recomputed status, winner, and winnerUsername", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        status: "completed",
        winner: "u1",
        winnerUsername: "aman",
      }).success,
    ).toBe(true);
  });

  test("accepts a null winner and winnerUsername (draw / unknown)", () => {
    expect(
      gameCardMetaSchema.safeParse({
        ...base,
        winner: null,
        winnerUsername: null,
      }).success,
    ).toBe(true);
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
