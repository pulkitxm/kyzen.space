import { describe, expect, it } from "bun:test";
import type { ConversationJson, MemberJson } from "@kyzen/shared/types";
import { conversationHref } from "@/lib/chat/conversation-href";

function member(id: string, username: string): MemberJson {
  return {
    id,
    username,
    displayName: null,
    avatar: null,
    role: "member",
  };
}

type Conv = Pick<ConversationJson, "id" | "kind" | "name" | "members">;

const viewer = member("u1", "alice");
const other = member("u2", "bob");

describe("conversationHref - group branch", () => {
  it("routes a named group to its name route", () => {
    const conv: Conv = {
      id: "c1",
      kind: "group",
      name: "Squad",
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/group/Squad");
  });

  it("percent-encodes a group name with spaces and special characters", () => {
    const conv: Conv = {
      id: "c1",
      kind: "group",
      name: "Night Owls & Co/Team",
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe(
      "/chat/group/Night%20Owls%20%26%20Co%2FTeam",
    );
  });

  it("falls through to the other member when a group has no name", () => {
    const conv: Conv = {
      id: "c1",
      kind: "group",
      name: null,
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/bob");
  });

  it("treats an empty-string group name as no name and uses the member route", () => {
    const conv: Conv = {
      id: "c1",
      kind: "group",
      name: "",
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/bob");
  });
});

describe("conversationHref - DM branch", () => {
  it("routes a DM to the other member's username, never the viewer's", () => {
    const conv: Conv = {
      id: "c1",
      kind: "dm",
      name: null,
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/bob");
    expect(conversationHref(conv, "u2")).toBe("/chat/alice");
  });

  it("ignores a DM name even when present and uses the other member", () => {
    const conv: Conv = {
      id: "c1",
      kind: "dm",
      name: "stored dm name",
      members: [viewer, other],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/bob");
  });
});

describe("conversationHref - no other member fallback", () => {
  it("falls back to the conversation id when the viewer is the only member (self)", () => {
    const conv: Conv = {
      id: "c1",
      kind: "dm",
      name: null,
      members: [viewer],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/c1");
  });

  it("falls back to the conversation id for an empty member list", () => {
    const conv: Conv = {
      id: "c1",
      kind: "group",
      name: null,
      members: [],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/c1");
  });

  it("falls back to the conversation id when the viewer is absent from a self-only DM", () => {
    const conv: Conv = {
      id: "c1",
      kind: "dm",
      name: null,
      members: [viewer],
    };
    expect(conversationHref(conv, "u1")).toBe("/chat/c1");
  });
});
