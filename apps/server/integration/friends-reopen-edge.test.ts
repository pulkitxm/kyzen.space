import { afterAll, describe, expect, it } from "bun:test";
import { friends } from "@kyzen/database";
import * as friendsService from "../src/chat/friends-service";
import {
  createHarness,
  DB_UP,
  expectErr,
  type TestUser,
  unwrap,
} from "./harness";

const h = createHarness("fre");

afterAll(h.cleanup);

async function requestThenDecline(
  requester: TestUser,
  addressee: TestUser,
): Promise<string> {
  unwrap(
    await friendsService.sendFriendRequest(requester.id, addressee.username),
  );
  const row = await friends.getFriendshipBetween(requester.id, addressee.id);
  unwrap(
    await friendsService.respondToRequest(
      addressee.id,
      row?.id ?? "",
      "decline",
    ),
  );
  return row?.id ?? "";
}

describe.skipIf(!DB_UP)(
  "friends reopen state machine (declined -> pending)",
  () => {
    it("re-requesting after a decline reopens the same row rather than creating a new one", async () => {
      const a = await h.makeUser("rp1a");
      const b = await h.makeUser("rp1b");

      const declinedId = await requestThenDecline(a, b);
      const declined = await friends.getById(declinedId);
      expect(declined?.status).toBe("declined");
      expect(declined?.respondedAt).not.toBeNull();

      const reopened = unwrap(
        await friendsService.sendFriendRequest(a.id, b.username),
      );
      expect(reopened.status).toBe("pending");
      expect(reopened.direction).toBe("outgoing");

      const row = await friends.getFriendshipBetween(a.id, b.id);
      expect(row?.id).toBe(declinedId);
      expect(row?.status).toBe("pending");
      expect(row?.respondedAt).toBeNull();
      expect(row?.requesterId).toBe(a.id);
      expect(row?.addresseeId).toBe(b.id);
    });

    it("the original decliner re-requesting reopens with requester and addressee swapped", async () => {
      const a = await h.makeUser("rp2a");
      const b = await h.makeUser("rp2b");

      const declinedId = await requestThenDecline(a, b);

      const reopened = unwrap(
        await friendsService.sendFriendRequest(b.id, a.username),
      );
      expect(reopened.status).toBe("pending");

      const row = await friends.getById(declinedId);
      expect(row?.id).toBe(declinedId);
      expect(row?.status).toBe("pending");
      expect(row?.requesterId).toBe(b.id);
      expect(row?.addresseeId).toBe(a.id);

      expect(
        (await friends.listPendingIncoming(a.id)).some(
          (r) => r.requesterId === b.id,
        ),
      ).toBe(true);
      expect(
        (await friends.listPendingOutgoing(b.id)).some(
          (r) => r.addresseeId === a.id,
        ),
      ).toBe(true);
    });

    it("a reopened request can be accepted to make the pair friends with one row", async () => {
      const a = await h.makeUser("rp3a");
      const b = await h.makeUser("rp3b");

      const declinedId = await requestThenDecline(a, b);
      unwrap(await friendsService.sendFriendRequest(a.id, b.username));

      const reopened = await friends.getById(declinedId);
      unwrap(
        await friendsService.respondToRequest(
          b.id,
          reopened?.id ?? "",
          "accept",
        ),
      );

      expect(await friends.areFriends(a.id, b.id)).toBe(true);
      const all = await friends.listAllForUser(a.id);
      expect(
        all.filter((r) => friends.otherUserId(r, a.id) === b.id),
      ).toHaveLength(1);
    });

    it("the new addressee of a swapped reopen can accept it (the original requester)", async () => {
      const a = await h.makeUser("rp4a");
      const b = await h.makeUser("rp4b");

      const declinedId = await requestThenDecline(a, b);
      unwrap(await friendsService.sendFriendRequest(b.id, a.username));

      const reopened = await friends.getById(declinedId);
      unwrap(
        await friendsService.respondToRequest(
          a.id,
          reopened?.id ?? "",
          "accept",
        ),
      );
      expect(await friends.areFriends(a.id, b.id)).toBe(true);
    });

    it("after a swapped reopen the previous addressee can no longer answer the request", async () => {
      const a = await h.makeUser("rp5a");
      const b = await h.makeUser("rp5b");

      const declinedId = await requestThenDecline(a, b);
      unwrap(await friendsService.sendFriendRequest(b.id, a.username));

      const reopened = await friends.getById(declinedId);
      expectErr(
        await friendsService.respondToRequest(
          b.id,
          reopened?.id ?? "",
          "accept",
        ),
        403,
      );
    });

    it("a pending reverse request still auto-accepts (does not reopen) when the addressee asks back", async () => {
      const a = await h.makeUser("rp6a");
      const b = await h.makeUser("rp6b");

      unwrap(await friendsService.sendFriendRequest(a.id, b.username));
      const reverse = unwrap(
        await friendsService.sendFriendRequest(b.id, a.username),
      );
      expect(reverse.status).toBe("accepted");
      expect(await friends.areFriends(a.id, b.id)).toBe(true);

      const all = await friends.listAllForUser(a.id);
      expect(
        all.filter((r) => friends.otherUserId(r, a.id) === b.id),
      ).toHaveLength(1);
    });
  },
);

if (!DB_UP) {
  describe("friends reopen edge cases", () => {
    it.skip("skipped - database unreachable; run `bun run db:start`", () => {});
  });
}
