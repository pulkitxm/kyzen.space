import { describe, expect, test } from "bun:test";
import { clientCreateGameInConversationSchema } from "../src/schemas";

describe("clientCreateGameInConversationSchema", () => {
  test("accepts a registered gameType", () => {
    const r = clientCreateGameInConversationSchema.safeParse({
      conversationId: "c1",
      gameType: "tic-tac-toe",
    });
    expect(r.success).toBe(true);
  });

  test("rejects an unknown gameType", () => {
    const r = clientCreateGameInConversationSchema.safeParse({
      conversationId: "c1",
      gameType: "chess",
    });
    expect(r.success).toBe(false);
  });
});
