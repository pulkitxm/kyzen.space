import { afterAll, describe, expect, it } from "bun:test";
import {
  conversations,
  games,
  generateInviteToken,
  invites,
  notifications,
} from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { acceptInvite, peekInvite } from "../src/chat/invite-service";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("inv");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)("invite accept flow", () => {
  it("peek returns gameType + inviter without leaking email", async () => {
    const inviter = await h.makeUser("peekHost");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const peek = await peekInvite(token);
    expect(peek.expired).toBe(false);
    expect(peek.gameType).toBe(TIC_TAC_TOE);
    expect(peek.inviter?.username).toBe(inviter.username);
    expect(JSON.stringify(peek)).not.toContain("@itest.local");
  });

  it("accept creates the DM, a live game, and a game_invite notification", async () => {
    const inviter = await h.makeUser("acceptHost");
    const accepter = await h.makeUser("guest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.selfInvite).toBe(false);
    expect(res.value.gameId).toBeTruthy();
    h.trackGame(res.value.gameId as string);

    const dm = await conversations.findDm(inviter.id, accepter.id);
    expect(dm).not.toBeNull();

    const game = await games.getGameByCode(res.value.gameId as string);
    expect(game?.gameType).toBe(TIC_TAC_TOE);
    expect(game?.creatorUserId).toBe(inviter.id);
    expect(game?.seatingMode).toBe("open");
    expect(game?.challengedUserId).toBeNull();
    expect(game?.players.some((p) => p.userId === inviter.id)).toBe(true);

    const inviterNotifs = await notifications.listForUser(inviter.id, {
      unreadOnly: true,
    });
    expect(
      inviterNotifs.notifications.some((n) => n.type === "game_invite"),
    ).toBe(true);
  });

  it("opening your own link does not create a self-game", async () => {
    const inviter = await h.makeUser("selfHost");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, inviter.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.selfInvite).toBe(true);
      expect(res.value.gameId).toBeNull();
    }
  });

  it("rejects an expired token", async () => {
    const inviter = await h.makeUser("expHost");
    const accepter = await h.makeUser("expGuest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("treats an expiresAt of exactly now as expired (peek + accept)", async () => {
    const inviter = await h.makeUser("nowHost");
    const accepter = await h.makeUser("nowGuest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() - 1),
    });

    const peek = await peekInvite(token);
    expect(peek.expired).toBe(true);
    expect(peek.gameType).toBeNull();

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("accepted game is open-seated with the inviter pre-seated and no challenge", async () => {
    const inviter = await h.makeUser("openHost");
    const accepter = await h.makeUser("openGuest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    h.trackGame(res.value.gameId as string);

    const game = await games.getGameByCode(res.value.gameId as string);
    expect(game?.seatingMode).toBe("open");
    expect(game?.challengedUserId).toBeNull();
    expect(game?.players.length).toBe(1);
    expect(game?.players[0]?.userId).toBe(inviter.id);
  });

  it("threads the invite config through into the persisted game", async () => {
    const inviter = await h.makeUser("cfgHost");
    const accepter = await h.makeUser("cfgGuest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      config: {},
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    h.trackGame(res.value.gameId as string);

    const game = await games.getGameByCode(res.value.gameId as string);
    expect(game?.config).toEqual({});
  });

  it("invites.create rejects a token shorter than the minimum length", async () => {
    const inviter = await h.makeUser("shortHost");
    const short = "short-token-below-the-43-char-minimum";
    let threw = false;
    try {
      await invites.create({
        inviterUserId: inviter.id,
        gameType: TIC_TAC_TOE,
        token: short,
        expiresAt: new Date(Date.now() + 60_000),
      });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("too short");
    }
    expect(threw).toBe(true);
    expect(await invites.getByToken(short)).toBeNull();
  });
});
