import { describe, expect, it } from "bun:test";
import type { ConversationJson, MemberJson } from "@kyzen/shared/types";
import { createStore } from "jotai";
import {
  type ChatMessage,
  conversationsAtom,
  conversationUnreadAtomFamily,
  totalUnreadAtom,
  upsertConversation,
  upsertMessage,
} from "@/lib/chat/atoms";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    conversationId: "c1",
    sender: null,
    kind: "text",
    body: "hi",
    metadata: null,
    gameId: null,
    createdAt: null,
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function member(id: string): MemberJson {
  return {
    id,
    username: `user-${id}`,
    displayName: null,
    avatar: null,
    role: "member",
  };
}

function conversation(
  id: string,
  unreadCount: number,
  overrides: Partial<ConversationJson> = {},
): ConversationJson {
  return {
    id,
    kind: "dm",
    name: null,
    avatarUrl: null,
    members: [member("u1")],
    lastMessage: null,
    unreadCount,
    lastMessageAt: null,
    createdAt: null,
    ...overrides,
  };
}

describe("upsertMessage", () => {
  it("replaces the pending row matched by clientId, keeping list length", () => {
    const pending = message({ id: "temp", clientId: "ck", pending: true });
    const confirmed = message({ id: "server-1", clientId: "ck" });
    const out = upsertMessage([pending], confirmed);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("server-1");
    expect(out[0].pending).toBeUndefined();
  });

  it("prefers the clientId match over an id match (no double-insert)", () => {
    const existing = [
      message({ id: "a", clientId: "ck" }),
      message({ id: "server-1" }),
    ];
    const incoming = message({ id: "server-1", clientId: "ck" });
    const out = upsertMessage(existing, incoming);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("server-1");
    expect(out[1].id).toBe("server-1");
  });

  it("dedupes by server id when there is no clientId", () => {
    const existing = [message({ id: "x", body: "old" })];
    const out = upsertMessage(existing, message({ id: "x", body: "new" }));
    expect(out).toHaveLength(1);
    expect(out[0].body).toBe("new");
  });

  it("appends a genuinely new message", () => {
    const existing = [message({ id: "x" })];
    const out = upsertMessage(existing, message({ id: "y" }));
    expect(out.map((m) => m.id)).toEqual(["x", "y"]);
  });

  it("appends when an incoming clientId does not match any pending row", () => {
    const existing = [message({ id: "x", clientId: "other" })];
    const out = upsertMessage(existing, message({ id: "y", clientId: "new" }));
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe("y");
  });

  it("does not mutate the input list", () => {
    const existing = [message({ id: "x" })];
    const snapshot = [...existing];
    upsertMessage(existing, message({ id: "y" }));
    expect(existing).toEqual(snapshot);
  });
});

describe("upsertConversation", () => {
  it("replaces an existing conversation in place by id", () => {
    const existing = [conversation("a", 1), conversation("b", 2)];
    const out = upsertConversation(existing, conversation("b", 9));
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
    expect(out[1].unreadCount).toBe(9);
  });

  it("prepends a brand-new conversation to the front", () => {
    const existing = [conversation("a", 1)];
    const out = upsertConversation(existing, conversation("z", 0));
    expect(out.map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("does not mutate the input list", () => {
    const existing = [conversation("a", 1)];
    const snapshot = [...existing];
    upsertConversation(existing, conversation("z", 0));
    expect(existing).toEqual(snapshot);
  });
});

describe("totalUnreadAtom", () => {
  it("sums unread counts across conversations", () => {
    const store = createStore();
    store.set(conversationsAtom, [conversation("a", 3), conversation("b", 4)]);
    expect(store.get(totalUnreadAtom)).toBe(7);
  });

  it("treats a missing unreadCount as zero", () => {
    const store = createStore();
    store.set(conversationsAtom, [
      conversation("a", 2),
      { ...conversation("b", 0), unreadCount: undefined as unknown as number },
    ]);
    expect(store.get(totalUnreadAtom)).toBe(2);
  });

  it("is zero for an empty list", () => {
    const store = createStore();
    expect(store.get(totalUnreadAtom)).toBe(0);
  });
});

describe("conversationUnreadAtomFamily", () => {
  it("reads the unread count for a specific conversation", () => {
    const store = createStore();
    store.set(conversationsAtom, [conversation("a", 5), conversation("b", 1)]);
    expect(store.get(conversationUnreadAtomFamily("a"))).toBe(5);
  });

  it("returns zero for an unknown conversation id", () => {
    const store = createStore();
    store.set(conversationsAtom, [conversation("a", 5)]);
    expect(store.get(conversationUnreadAtomFamily("missing"))).toBe(0);
  });

  it("returns zero when the matched conversation has a nullish count", () => {
    const store = createStore();
    store.set(conversationsAtom, [
      { ...conversation("a", 0), unreadCount: undefined as unknown as number },
    ]);
    expect(store.get(conversationUnreadAtomFamily("a"))).toBe(0);
  });
});
