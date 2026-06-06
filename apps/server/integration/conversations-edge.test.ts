import { afterAll, describe, expect, it } from "bun:test";
import { conversations } from "@gamelobby/database";
import * as conversationsService from "../src/chat/conversations-service";
import {
  createHarness,
  DB_UP,
  expectErr,
  type TestUser,
  unwrap,
} from "./harness";

const h = createHarness("ce");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)("createDm edge cases", () => {
  it("is order-independent: createDm(a,b) and createDm(b,a) return the same id", async () => {
    const a = await h.makeUser("oa");
    const b = await h.makeUser("ob");
    const forward = await h.makeDm(a, b);
    const reverse = unwrap(await conversationsService.createDm(b.id, a.id));
    expect(reverse.id).toBe(forward);
    expect(reverse.kind).toBe("dm");
  });
});

describe.skipIf(!DB_UP)("addMembers edge cases", () => {
  it("on a DM returns 404 Group not found", async () => {
    const a = await h.makeUser("ada");
    const b = await h.makeUser("adb");
    const c = await h.makeUser("adc");
    const dmId = await h.makeDm(a, b);
    const res = await conversationsService.addMembers(a.id, dmId, [c.id]);
    expectErr(res, 404);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Group not found");
  });

  it("with only unresolvable ids returns 400 No valid users to add", async () => {
    const a = await h.makeUser("aua");
    const gid = await h.makeGroup(a, "Unresolvable", []);
    const res = await conversationsService.addMembers(a.id, gid, [
      "ghost-1-xyz",
      "ghost-2-xyz",
    ]);
    expectErr(res, 400);
    if (!res.ok) expect(res.error).toBe("No valid users to add");
  });

  it("re-adding an existing member does not duplicate membership", async () => {
    const a = await h.makeUser("ara");
    const b = await h.makeUser("arb");
    const gid = await h.makeGroup(a, "NoDupes", [b.id]);
    const before = await conversations.getMemberIds(gid);
    expect(before.length).toBe(2);

    unwrap(await conversationsService.addMembers(a.id, gid, [b.id]));
    const after = await conversations.getMemberIds(gid);
    expect(after.length).toBe(2);
    expect(after.filter((id) => id === b.id).length).toBe(1);
    expect(new Set(after).size).toBe(after.length);
  });

  it("re-adds a previously removed member by clearing leftAt", async () => {
    const a = await h.makeUser("rra");
    const b = await h.makeUser("rrb");
    const gid = await h.makeGroup(a, "ReJoin", [b.id]);
    unwrap(await conversationsService.removeMember(a.id, gid, b.id));
    expect(await conversations.getMemberIds(gid)).not.toContain(b.id);

    unwrap(await conversationsService.addMembers(a.id, gid, [b.id]));
    const ids = await conversations.getMemberIds(gid);
    expect(ids).toContain(b.id);
    expect(ids.filter((id) => id === b.id).length).toBe(1);
  });
});

describe.skipIf(!DB_UP)("removeMember edge cases", () => {
  it("on a DM returns 404 Group not found", async () => {
    const a = await h.makeUser("rda");
    const b = await h.makeUser("rdb");
    const dmId = await h.makeDm(a, b);
    const res = await conversationsService.removeMember(a.id, dmId, b.id);
    expectErr(res, 404);
    if (!res.ok) expect(res.error).toBe("Group not found");
  });

  it("removing a non-member by the owner is a no-op that still succeeds", async () => {
    const a = await h.makeUser("rna");
    const b = await h.makeUser("rnb");
    const outsider = await h.makeUser("rno");
    const gid = await h.makeGroup(a, "Outsiders", [b.id]);
    const before = await conversations.getMemberIds(gid);

    unwrap(await conversationsService.removeMember(a.id, gid, outsider.id));
    const after = await conversations.getMemberIds(gid);
    expect(after.sort()).toEqual(before.sort());
    expect(after).not.toContain(outsider.id);
  });

  it("a non-owner cannot remove a non-member (role gate applies first)", async () => {
    const a = await h.makeUser("rga");
    const b = await h.makeUser("rgb");
    const outsider = await h.makeUser("rgo");
    const gid = await h.makeGroup(a, "Gated", [b.id]);
    expectErr(
      await conversationsService.removeMember(b.id, gid, outsider.id),
      403,
    );
  });

  it("owner can leave (remove self), leaving the group ownerless", async () => {
    const a = await h.makeUser("osa");
    const b = await h.makeUser("osb");
    const gid = await h.makeGroup(a, "OwnerLeaves", [b.id]);
    unwrap(await conversationsService.removeMember(a.id, gid, a.id));

    const ids = await conversations.getMemberIds(gid);
    expect(ids).not.toContain(a.id);
    expect(ids).toContain(b.id);
    expect(await conversations.getMemberRole(gid, a.id)).toBeNull();
  });
});

describe.skipIf(!DB_UP)("renameGroup edge cases", () => {
  it("on a DM returns 404 Group not found", async () => {
    const a = await h.makeUser("rena");
    const b = await h.makeUser("renb");
    const dmId = await h.makeDm(a, b);
    const res = await conversationsService.renameGroup(a.id, dmId, "Nope");
    expectErr(res, 404);
    if (!res.ok) expect(res.error).toBe("Group not found");
  });

  it("to a whitespace-only name returns 400 Group name is required", async () => {
    const a = await h.makeUser("rwa");
    const gid = await h.makeGroup(a, "Keep", []);
    const res = await conversationsService.renameGroup(a.id, gid, "   ");
    expectErr(res, 400);
    if (!res.ok) expect(res.error).toBe("Group name is required");

    const conv = await conversations.getById(gid);
    expect(conv?.name).toBe("Keep");
  });

  it("trims surrounding whitespace from a valid new name", async () => {
    const a = await h.makeUser("rta");
    const gid = await h.makeGroup(a, "Before", []);
    const renamed = unwrap(
      await conversationsService.renameGroup(a.id, gid, "  After  "),
    );
    expect(renamed.name).toBe("After");
  });
});

describe.skipIf(!DB_UP)("getMemberRole and createGroup roles", () => {
  it("returns null for a non-member", async () => {
    const a = await h.makeUser("nma");
    const outsider = await h.makeUser("nmo");
    const gid = await h.makeGroup(a, "Roles", []);
    expect(await conversations.getMemberRole(gid, outsider.id)).toBeNull();
  });

  it("returns null after a member has left", async () => {
    const a = await h.makeUser("lma");
    const b = await h.makeUser("lmb");
    const gid = await h.makeGroup(a, "Left", [b.id]);
    expect(await conversations.getMemberRole(gid, b.id)).toBe("member");
    unwrap(await conversationsService.removeMember(a.id, gid, b.id));
    expect(await conversations.getMemberRole(gid, b.id)).toBeNull();
  });

  it("assigns owner to the creator and member to everyone else", async () => {
    const owner = await h.makeUser("coo");
    const m1 = await h.makeUser("cm1");
    const m2 = await h.makeUser("cm2");
    const m3 = await h.makeUser("cm3");
    const members: TestUser[] = [m1, m2, m3];
    const gid = await h.makeGroup(
      owner,
      "Crowd",
      members.map((m) => m.id),
    );

    expect(await conversations.getMemberRole(gid, owner.id)).toBe("owner");
    for (const m of members) {
      expect(await conversations.getMemberRole(gid, m.id)).toBe("member");
    }
    const ids = await conversations.getMemberIds(gid);
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("deduplicates a member id that is repeated in createGroup input", async () => {
    const owner = await h.makeUser("dgo");
    const m1 = await h.makeUser("dgm");
    const gid = await h.makeGroup(owner, "Deduped", [m1.id, m1.id, m1.id]);
    const ids = await conversations.getMemberIds(gid);
    expect(ids.length).toBe(2);
    expect(ids.filter((id) => id === m1.id).length).toBe(1);
  });

  it("drops the creator id from the members list without a duplicate owner row", async () => {
    const owner = await h.makeUser("sco");
    const m1 = await h.makeUser("scm");
    const gid = await h.makeGroup(owner, "SelfInMembers", [owner.id, m1.id]);
    const ids = await conversations.getMemberIds(gid);
    expect(ids.length).toBe(2);
    expect(ids.filter((id) => id === owner.id).length).toBe(1);
    expect(await conversations.getMemberRole(gid, owner.id)).toBe("owner");
  });
});
