import { afterAll, describe, expect, it } from "bun:test";
import { games } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import { createHarness, DB_UP, expectErr, unwrap } from "./harness";

const h = createHarness("gi");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)(
  "createGameInConversation - error and branch matrix",
  () => {
    it("returns 404 for a non-existent conversation", async () => {
      const a = await h.makeUser("noconv");
      const res = await createGameInConversation({
        userId: a.id,
        conversationId: crypto.randomUUID(),
        gameType: TIC_TAC_TOE,
      });
      expectErr(res, 404);
      if (!res.ok) expect(res.error).toBe("Conversation not found");
    });

    it("returns 403 when a non-member tries to create a game", async () => {
      const a = await h.makeUser("dmA");
      const b = await h.makeUser("dmB");
      const outsider = await h.makeUser("outsider");
      const convId = await h.makeDm(a, b);

      const res = await createGameInConversation({
        userId: outsider.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
      });
      expectErr(res, 403);
      if (!res.ok) expect(res.error).toBe("Not a member of this conversation");
    });

    it("returns 400 for an unsupported game type", async () => {
      const a = await h.makeUser("badtypeA");
      const b = await h.makeUser("badtypeB");
      const convId = await h.makeDm(a, b);

      const res = await createGameInConversation({
        userId: a.id,
        conversationId: convId,
        // @ts-expect-error unknown game type is rejected at runtime
        gameType: "definitely-not-a-game",
      });
      expectErr(res, 400);
      if (!res.ok) expect(res.error).toBe("Unsupported game type");
    });

    it("returns 400 for an invalid config against the strict empty schema", async () => {
      const a = await h.makeUser("badcfgA");
      const b = await h.makeUser("badcfgB");
      const convId = await h.makeDm(a, b);

      const res = await createGameInConversation({
        userId: a.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
        config: { x: 1 },
      });
      expectErr(res, 400);
      if (!res.ok) expect(res.error).toBe("Invalid game config");
    });

    it("returns 400 for a group game with no seating mode", async () => {
      const owner = await h.makeUser("grpOwner1");
      const member = await h.makeUser("grpMember1");
      const convId = await h.makeGroup(owner, "gi group no mode", [member.id]);

      const res = await createGameInConversation({
        userId: owner.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
      });
      expectErr(res, 400);
      if (!res.ok)
        expect(res.error).toBe("Pick a seating mode for the group game");
    });

    it("returns 400 for a group challenge with no challenged user", async () => {
      const owner = await h.makeUser("grpOwner2");
      const member = await h.makeUser("grpMember2");
      const convId = await h.makeGroup(owner, "gi group no target", [
        member.id,
      ]);

      const res = await createGameInConversation({
        userId: owner.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
        seatingMode: "challenge",
      });
      expectErr(res, 400);
      if (!res.ok) expect(res.error).toBe("Choose a member to challenge");
    });

    it("returns 400 when challenging yourself", async () => {
      const owner = await h.makeUser("grpOwner3");
      const member = await h.makeUser("grpMember3");
      const convId = await h.makeGroup(owner, "gi group self challenge", [
        member.id,
      ]);

      const res = await createGameInConversation({
        userId: owner.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
        seatingMode: "challenge",
        challengedUserId: owner.id,
      });
      expectErr(res, 400);
      if (!res.ok) expect(res.error).toBe("Choose a member to challenge");
    });

    it("returns 400 when the challenged user is not in the conversation", async () => {
      const owner = await h.makeUser("grpOwner4");
      const member = await h.makeUser("grpMember4");
      const stranger = await h.makeUser("stranger4");
      const convId = await h.makeGroup(owner, "gi group stranger", [member.id]);

      const res = await createGameInConversation({
        userId: owner.id,
        conversationId: convId,
        gameType: TIC_TAC_TOE,
        seatingMode: "challenge",
        challengedUserId: stranger.id,
      });
      expectErr(res, 400);
      if (!res.ok) {
        expect(res.error).toBe("Challenged user is not in this conversation");
      }
    });

    it("creates a valid group challenge game and seats the creator as X", async () => {
      const owner = await h.makeUser("grpOwner5");
      const member = await h.makeUser("grpMember5");
      const convId = await h.makeGroup(owner, "gi group challenge ok", [
        member.id,
      ]);

      const { game, message } = unwrap(
        await createGameInConversation({
          userId: owner.id,
          conversationId: convId,
          gameType: TIC_TAC_TOE,
          seatingMode: "challenge",
          challengedUserId: member.id,
        }),
      );
      h.trackGame(game.id);

      expect(game.seatingMode).toBe("challenge");
      expect(game.challengedUserId).toBe(member.id);
      expect(game.creatorUserId).toBe(owner.id);
      expect(game.conversationId).toBe(convId);
      expect(game.status).toBe("waiting");
      expect(game.players).toEqual([
        { userId: owner.id, username: owner.username, role: "X" },
      ]);
      expect(message?.kind).toBe("game_card");
      expect(message?.gameId).toBe(game.id);

      const loaded = await games.getGameByCode(game.id);
      expect(loaded?.seatingMode).toBe("challenge");
      expect(loaded?.challengedUserId).toBe(member.id);
      expect(loaded?.players).toHaveLength(1);
      expect(loaded?.players[0]?.userId).toBe(owner.id);
      expect(loaded?.players[0]?.role).toBe("X");
    });

    it("creates a valid group open game and seats only the creator", async () => {
      const owner = await h.makeUser("grpOwner6");
      const member = await h.makeUser("grpMember6");
      const convId = await h.makeGroup(owner, "gi group open ok", [member.id]);

      const { game, message } = unwrap(
        await createGameInConversation({
          userId: owner.id,
          conversationId: convId,
          gameType: TIC_TAC_TOE,
          seatingMode: "open",
        }),
      );
      h.trackGame(game.id);

      expect(game.seatingMode).toBe("open");
      expect(game.challengedUserId).toBeNull();
      expect(game.creatorUserId).toBe(owner.id);
      expect(game.players).toEqual([
        { userId: owner.id, username: owner.username, role: "X" },
      ]);
      expect(message?.kind).toBe("game_card");

      const loaded = await games.getGameByCode(game.id);
      expect(loaded?.seatingMode).toBe("open");
      expect(loaded?.challengedUserId).toBeNull();
      expect(loaded?.players).toHaveLength(1);
    });

    it("ignores seatingMode and challengedUserId for a DM and forces open seating", async () => {
      const a = await h.makeUser("dmOverrideA");
      const b = await h.makeUser("dmOverrideB");
      const convId = await h.makeDm(a, b);

      const { game } = unwrap(
        await createGameInConversation({
          userId: a.id,
          conversationId: convId,
          gameType: TIC_TAC_TOE,
          seatingMode: "challenge",
          challengedUserId: b.id,
        }),
      );
      h.trackGame(game.id);

      expect(game.seatingMode).toBe("open");
      expect(game.challengedUserId).toBeNull();
    });

    it("accepts a non-member challenger as a member-creator and a member challenged user", async () => {
      const owner = await h.makeUser("grpOwner7");
      const challenger = await h.makeUser("grpChallenger7");
      const target = await h.makeUser("grpTarget7");
      const convId = await h.makeGroup(owner, "gi group member challenge", [
        challenger.id,
        target.id,
      ]);

      const { game } = unwrap(
        await createGameInConversation({
          userId: challenger.id,
          conversationId: convId,
          gameType: TIC_TAC_TOE,
          seatingMode: "challenge",
          challengedUserId: target.id,
        }),
      );
      h.trackGame(game.id);

      expect(game.creatorUserId).toBe(challenger.id);
      expect(game.challengedUserId).toBe(target.id);
      expect(game.players).toEqual([
        { userId: challenger.id, username: challenger.username, role: "X" },
      ]);
    });
  },
);
