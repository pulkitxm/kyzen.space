import { describe, expect, test } from "bun:test";
import {
  clientAddMembersSchema,
  clientConversationRefSchema,
  clientCreateDmSchema,
  clientCreateGroupSchema,
  clientFriendRemoveSchema,
  clientFriendRequestSchema,
  clientFriendRespondSchema,
  clientMarkReadSchema,
  clientNotificationReadSchema,
  clientRemoveMemberSchema,
  clientRenameGroupSchema,
  clientSendMessageSchema,
  gifMetaSchema,
} from "../src/types";

const validGifMeta = {
  provider: "klipy",
  providerId: "abc123",
  previewUrl: "https://cdn/p.gif",
  fullUrl: "https://cdn/f.gif",
  width: 200,
  height: 150,
};

describe("clientSendMessageSchema", () => {
  test("accepts a text message", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "c1",
      clientId: "id1",
      kind: "text",
      body: "hi",
    });
    expect(r.success).toBe(true);
  });

  test("accepts a gif message with valid metadata", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "c1",
      clientId: "id1",
      kind: "gif",
      metadata: validGifMeta,
    });
    expect(r.success).toBe(true);
  });

  test("rejects a missing conversationId", () => {
    const r = clientSendMessageSchema.safeParse({ clientId: "id1" });
    expect(r.success).toBe(false);
  });

  test("rejects forged extra fields injected into gif metadata", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "c1",
      kind: "gif",
      metadata: { ...validGifMeta, evil: "<script>" },
    });
    expect(r.success).toBe(false);
  });

  test("rejects a non-klipy gif provider", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "c1",
      kind: "gif",
      metadata: { ...validGifMeta, provider: "evil" },
    });
    expect(r.success).toBe(false);
  });

  test("rejects an empty conversationId", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "",
      body: "hi",
    });
    expect(r.success).toBe(false);
  });

  test("rejects an unknown kind", () => {
    const r = clientSendMessageSchema.safeParse({
      conversationId: "c1",
      kind: "voice",
    });
    expect(r.success).toBe(false);
  });

  test("accepts a payload with neither body nor metadata", () => {
    const r = clientSendMessageSchema.safeParse({ conversationId: "c1" });
    expect(r.success).toBe(true);
  });
});

describe("gifMetaSchema", () => {
  test("accepts the minimal required shape", () => {
    expect(gifMetaSchema.safeParse(validGifMeta).success).toBe(true);
  });

  test("accepts optional title and blurPreview", () => {
    const r = gifMetaSchema.safeParse({
      ...validGifMeta,
      title: "a cat",
      blurPreview: "data:image/png;base64,AAA",
    });
    expect(r.success).toBe(true);
  });

  test("rejects an unknown key", () => {
    expect(gifMetaSchema.safeParse({ ...validGifMeta, extra: 1 }).success).toBe(
      false,
    );
  });

  test("rejects a url-shaped forged extra key", () => {
    const r = gifMetaSchema.safeParse({
      ...validGifMeta,
      onerror: "https://evil.example/steal",
    });
    expect(r.success).toBe(false);
  });

  test("rejects a non-klipy provider literal", () => {
    expect(
      gifMetaSchema.safeParse({ ...validGifMeta, provider: "giphy" }).success,
    ).toBe(false);
  });

  for (const key of [
    "provider",
    "providerId",
    "previewUrl",
    "fullUrl",
    "width",
    "height",
  ] as const) {
    test(`rejects when required key ${key} is missing`, () => {
      const partial = { ...validGifMeta };
      delete (partial as Record<string, unknown>)[key];
      expect(gifMetaSchema.safeParse(partial).success).toBe(false);
    });
  }

  test("rejects a non-numeric width", () => {
    expect(
      gifMetaSchema.safeParse({ ...validGifMeta, width: "200" }).success,
    ).toBe(false);
  });

  test("rejects NaN dimensions", () => {
    expect(
      gifMetaSchema.safeParse({ ...validGifMeta, height: Number.NaN }).success,
    ).toBe(false);
  });
});

describe("clientCreateGroupSchema", () => {
  test("accepts an empty payload (name and members optional)", () => {
    expect(clientCreateGroupSchema.safeParse({}).success).toBe(true);
  });

  test("rejects non-string member ids", () => {
    const r = clientCreateGroupSchema.safeParse({ memberIds: ["u1", 5] });
    expect(r.success).toBe(false);
  });

  test("rejects an empty-string member id", () => {
    const r = clientCreateGroupSchema.safeParse({ memberIds: ["u1", ""] });
    expect(r.success).toBe(false);
  });

  test("accepts an empty memberIds array", () => {
    expect(
      clientCreateGroupSchema.safeParse({ name: "g", memberIds: [] }).success,
    ).toBe(true);
  });
});

describe("clientConversationRefSchema", () => {
  test("accepts a conversationId", () => {
    expect(
      clientConversationRefSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(true);
  });

  test("rejects a missing conversationId", () => {
    expect(clientConversationRefSchema.safeParse({}).success).toBe(false);
  });

  test("rejects an empty conversationId", () => {
    expect(
      clientConversationRefSchema.safeParse({ conversationId: "" }).success,
    ).toBe(false);
  });
});

describe("clientMarkReadSchema", () => {
  test("accepts both ids", () => {
    expect(
      clientMarkReadSchema.safeParse({ conversationId: "c1", messageId: "m1" })
        .success,
    ).toBe(true);
  });

  test("rejects a missing messageId", () => {
    expect(
      clientMarkReadSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(false);
  });

  test("rejects an empty messageId", () => {
    expect(
      clientMarkReadSchema.safeParse({ conversationId: "c1", messageId: "" })
        .success,
    ).toBe(false);
  });
});

describe("clientCreateDmSchema", () => {
  test("accepts a userId", () => {
    expect(clientCreateDmSchema.safeParse({ userId: "u1" }).success).toBe(true);
  });

  test("rejects a missing userId", () => {
    expect(clientCreateDmSchema.safeParse({}).success).toBe(false);
  });

  test("rejects an empty userId", () => {
    expect(clientCreateDmSchema.safeParse({ userId: "" }).success).toBe(false);
  });
});

describe("clientAddMembersSchema", () => {
  test("accepts a conversationId with userIds", () => {
    expect(
      clientAddMembersSchema.safeParse({
        conversationId: "c1",
        userIds: ["u1", "u2"],
      }).success,
    ).toBe(true);
  });

  test("accepts omitted userIds", () => {
    expect(
      clientAddMembersSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(true);
  });

  test("rejects a non-string member id", () => {
    expect(
      clientAddMembersSchema.safeParse({
        conversationId: "c1",
        userIds: ["u1", 2],
      }).success,
    ).toBe(false);
  });

  test("rejects a missing conversationId", () => {
    expect(clientAddMembersSchema.safeParse({ userIds: ["u1"] }).success).toBe(
      false,
    );
  });
});

describe("clientRemoveMemberSchema", () => {
  test("accepts both ids", () => {
    expect(
      clientRemoveMemberSchema.safeParse({
        conversationId: "c1",
        userId: "u1",
      }).success,
    ).toBe(true);
  });

  test("rejects a missing userId", () => {
    expect(
      clientRemoveMemberSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(false);
  });
});

describe("clientRenameGroupSchema", () => {
  test("accepts a conversationId with a name", () => {
    expect(
      clientRenameGroupSchema.safeParse({ conversationId: "c1", name: "g" })
        .success,
    ).toBe(true);
  });

  test("accepts an omitted name", () => {
    expect(
      clientRenameGroupSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(true);
  });

  test("rejects a missing conversationId", () => {
    expect(clientRenameGroupSchema.safeParse({ name: "g" }).success).toBe(
      false,
    );
  });
});

describe("clientFriendRequestSchema", () => {
  test("accepts a username", () => {
    expect(
      clientFriendRequestSchema.safeParse({ username: "aman" }).success,
    ).toBe(true);
  });

  test("rejects an empty username", () => {
    expect(clientFriendRequestSchema.safeParse({ username: "" }).success).toBe(
      false,
    );
  });

  test("rejects a missing username", () => {
    expect(clientFriendRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("clientFriendRespondSchema", () => {
  test("accepts accept and decline actions", () => {
    expect(
      clientFriendRespondSchema.safeParse({ requestId: "r1", action: "accept" })
        .success,
    ).toBe(true);
    expect(
      clientFriendRespondSchema.safeParse({
        requestId: "r1",
        action: "decline",
      }).success,
    ).toBe(true);
  });

  test("leaves action undefined when omitted (consumer defaults to accept)", () => {
    const r = clientFriendRespondSchema.safeParse({ requestId: "r1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.action).toBeUndefined();
  });

  test("rejects an unknown action", () => {
    expect(
      clientFriendRespondSchema.safeParse({ requestId: "r1", action: "block" })
        .success,
    ).toBe(false);
  });

  test("rejects a missing requestId", () => {
    expect(
      clientFriendRespondSchema.safeParse({ action: "accept" }).success,
    ).toBe(false);
  });
});

describe("clientFriendRemoveSchema", () => {
  test("accepts a userId", () => {
    expect(clientFriendRemoveSchema.safeParse({ userId: "u1" }).success).toBe(
      true,
    );
  });

  test("rejects an empty userId", () => {
    expect(clientFriendRemoveSchema.safeParse({ userId: "" }).success).toBe(
      false,
    );
  });
});

describe("clientNotificationReadSchema", () => {
  test("accepts an id", () => {
    expect(clientNotificationReadSchema.safeParse({ id: "n1" }).success).toBe(
      true,
    );
  });

  test("rejects a missing id", () => {
    expect(clientNotificationReadSchema.safeParse({}).success).toBe(false);
  });

  test("rejects an empty id", () => {
    expect(clientNotificationReadSchema.safeParse({ id: "" }).success).toBe(
      false,
    );
  });
});
