import { afterAll, describe, expect, it } from "bun:test";
import { friends } from "@kyzen/database";
import * as friendsService from "../src/chat/friends-service";
import { createHarness, DB_UP, expectErr, unwrap } from "./harness";

const h = createHarness("fe");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)("friends edge cases", () => {
  it("sendFriendRequest when already friends -> 409 Already friends", async () => {
    const a = await h.makeUser("af1");
    const b = await h.makeUser("af2");
    await h.befriend(a, b);
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
    const res = await friendsService.sendFriendRequest(a.id, b.username);
    expectErr(res, 409);
    if (!res.ok) expect(res.error).toBe("Already friends");
  });

  it("already friends -> 409 regardless of which side asks again", async () => {
    const a = await h.makeUser("af3");
    const b = await h.makeUser("af4");
    await h.befriend(a, b);
    const fromA = await friendsService.sendFriendRequest(a.id, b.username);
    const fromB = await friendsService.sendFriendRequest(b.id, a.username);
    expectErr(fromA, 409);
    expectErr(fromB, 409);
    if (!fromA.ok) expect(fromA.error).toBe("Already friends");
    if (!fromB.ok) expect(fromB.error).toBe("Already friends");
  });

  it("respondToRequest with a non-existent requestId -> 404", async () => {
    const a = await h.makeUser("nf1");
    const res = await friendsService.respondToRequest(
      a.id,
      crypto.randomUUID(),
      "accept",
    );
    expectErr(res, 404);
    if (!res.ok) expect(res.error).toBe("Request not found");
  });

  it("respondToRequest to an already-accepted request -> 409", async () => {
    const a = await h.makeUser("aa1");
    const b = await h.makeUser("aa2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "accept"),
    );
    const again = await friendsService.respondToRequest(
      b.id,
      row?.id ?? "",
      "accept",
    );
    expectErr(again, 409);
    if (!again.ok) expect(again.error).toBe("Request already answered");
  });

  it("respondToRequest to an already-declined request -> 409", async () => {
    const a = await h.makeUser("ad1");
    const b = await h.makeUser("ad2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "decline"),
    );
    const again = await friendsService.respondToRequest(
      b.id,
      row?.id ?? "",
      "decline",
    );
    expectErr(again, 409);
    if (!again.ok) expect(again.error).toBe("Request already answered");
  });

  it("respondToRequest by the requester (not addressee) -> 403", async () => {
    const a = await h.makeUser("rq1");
    const b = await h.makeUser("rq2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    const res = await friendsService.respondToRequest(
      a.id,
      row?.id ?? "",
      "accept",
    );
    expectErr(res, 403);
    if (!res.ok) expect(res.error).toBe("Not your request");
  });

  it("respondToRequest 403 ownership check precedes status check (requester on accepted)", async () => {
    const a = await h.makeUser("rq3");
    const b = await h.makeUser("rq4");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "accept"),
    );
    const res = await friendsService.respondToRequest(
      a.id,
      row?.id ?? "",
      "accept",
    );
    expectErr(res, 403);
    if (!res.ok) expect(res.error).toBe("Not your request");
  });

  it("respondToRequest by an unrelated third party -> 403", async () => {
    const a = await h.makeUser("tp1");
    const b = await h.makeUser("tp2");
    const c = await h.makeUser("tp3");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    const res = await friendsService.respondToRequest(
      c.id,
      row?.id ?? "",
      "accept",
    );
    expectErr(res, 403);
    if (!res.ok) expect(res.error).toBe("Not your request");
  });

  it("removeFriend when they are NOT friends is idempotent ok (no throw)", async () => {
    const a = await h.makeUser("xr1");
    const b = await h.makeUser("xr2");
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
    unwrap(await friendsService.removeFriend(a.id, b.id));
    expect(await friends.getFriendshipBetween(a.id, b.id)).toBeNull();
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
  });

  it("removeFriend is safe to call twice after a real befriend", async () => {
    const a = await h.makeUser("xr3");
    const b = await h.makeUser("xr4");
    await h.befriend(a, b);
    unwrap(await friendsService.removeFriend(a.id, b.id));
    unwrap(await friendsService.removeFriend(a.id, b.id));
    expect(await friends.getFriendshipBetween(a.id, b.id)).toBeNull();
  });

  it("befriend reflects in listFriends/areFriends both directions; remove clears both", async () => {
    const a = await h.makeUser("bd1");
    const b = await h.makeUser("bd2");
    await h.befriend(a, b);

    expect(await friends.areFriends(a.id, b.id)).toBe(true);
    expect(await friends.areFriends(b.id, a.id)).toBe(true);

    const aFriendIds = await friends.acceptedFriendIds(a.id);
    const bFriendIds = await friends.acceptedFriendIds(b.id);
    expect(aFriendIds).toContain(b.id);
    expect(bFriendIds).toContain(a.id);

    const aAccepted = await friends.listAccepted(a.id);
    const bAccepted = await friends.listAccepted(b.id);
    expect(aAccepted.some((r) => friends.otherUserId(r, a.id) === b.id)).toBe(
      true,
    );
    expect(bAccepted.some((r) => friends.otherUserId(r, b.id) === a.id)).toBe(
      true,
    );

    unwrap(await friendsService.removeFriend(a.id, b.id));

    expect(await friends.areFriends(a.id, b.id)).toBe(false);
    expect(await friends.areFriends(b.id, a.id)).toBe(false);
    expect(await friends.acceptedFriendIds(a.id)).not.toContain(b.id);
    expect(await friends.acceptedFriendIds(b.id)).not.toContain(a.id);
  });

  it("pending shows outgoing for requester, incoming for addressee; accept clears both", async () => {
    const a = await h.makeUser("pd1");
    const b = await h.makeUser("pd2");

    const sent = unwrap(
      await friendsService.sendFriendRequest(a.id, b.username),
    );
    expect(sent.status).toBe("pending");
    expect(sent.direction).toBe("outgoing");

    const outgoing = await friends.listPendingOutgoing(a.id);
    const incoming = await friends.listPendingIncoming(b.id);
    expect(outgoing.some((r) => r.addresseeId === b.id)).toBe(true);
    expect(incoming.some((r) => r.requesterId === a.id)).toBe(true);

    expect((await friends.listPendingIncoming(a.id)).length).toBe(0);
    expect((await friends.listPendingOutgoing(b.id)).length).toBe(0);

    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "accept"),
    );

    expect((await friends.listPendingOutgoing(a.id)).length).toBe(0);
    expect((await friends.listPendingIncoming(b.id)).length).toBe(0);
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
  });

  it("decline clears pending on both sides without making them friends", async () => {
    const a = await h.makeUser("pd3");
    const b = await h.makeUser("pd4");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "decline"),
    );
    expect((await friends.listPendingOutgoing(a.id)).length).toBe(0);
    expect((await friends.listPendingIncoming(b.id)).length).toBe(0);
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
  });

  it("full re-friend cycle: befriend -> remove -> request again -> pending", async () => {
    const a = await h.makeUser("rf1");
    const b = await h.makeUser("rf2");
    await h.befriend(a, b);
    unwrap(await friendsService.removeFriend(a.id, b.id));
    expect(await friends.getFriendshipBetween(a.id, b.id)).toBeNull();

    const again = unwrap(
      await friendsService.sendFriendRequest(a.id, b.username),
    );
    expect(again.status).toBe("pending");
    expect(again.direction).toBe("outgoing");
    expect(
      (await friends.listPendingIncoming(b.id)).some(
        (r) => r.requesterId === a.id,
      ),
    ).toBe(true);
  });

  it("canonical pairKey: A->B and B->A resolve to one row across several pairs", async () => {
    const a = await h.makeUser("ck1");
    const b = await h.makeUser("ck2");
    const c = await h.makeUser("ck3");
    const d = await h.makeUser("ck4");

    await friendsService.sendFriendRequest(a.id, b.username);
    await friendsService.sendFriendRequest(d.id, c.username);

    const abForward = await friends.getFriendshipBetween(a.id, b.id);
    const abReverse = await friends.getFriendshipBetween(b.id, a.id);
    expect(abForward?.id).toBeTruthy();
    expect(abForward?.id).toBe(abReverse?.id ?? "");

    const cdForward = await friends.getFriendshipBetween(c.id, d.id);
    const cdReverse = await friends.getFriendshipBetween(d.id, c.id);
    expect(cdForward?.id).toBeTruthy();
    expect(cdForward?.id).toBe(cdReverse?.id ?? "");

    expect(friends.pairKey(a.id, b.id)).toBe(friends.pairKey(b.id, a.id));
    expect(friends.pairKey(c.id, d.id)).toBe(friends.pairKey(d.id, c.id));
    expect(abForward?.id).not.toBe(cdForward?.id);
  });

  it("reverse pending request auto-accepts and clears pending", async () => {
    const a = await h.makeUser("rv1");
    const b = await h.makeUser("rv2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const res = unwrap(
      await friendsService.sendFriendRequest(b.id, a.username),
    );
    expect(res.status).toBe("accepted");
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
    expect((await friends.listPendingIncoming(a.id)).length).toBe(0);
    expect((await friends.listPendingOutgoing(b.id)).length).toBe(0);
  });
});
