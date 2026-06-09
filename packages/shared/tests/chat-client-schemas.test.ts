import { describe, expect, test } from "bun:test";
import {
  clientCreateGroupSchema,
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
});

describe("gifMetaSchema", () => {
  test("strips nothing but rejects unknown keys", () => {
    expect(gifMetaSchema.safeParse(validGifMeta).success).toBe(true);
    expect(gifMetaSchema.safeParse({ ...validGifMeta, extra: 1 }).success).toBe(
      false,
    );
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
});
