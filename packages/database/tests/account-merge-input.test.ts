import { describe, expect, it } from "bun:test";
import {
  accountMergeStatusSchema,
  recordAccountMergeInputSchema,
} from "@gamelobby/shared/types";

describe("account-merge input schemas", () => {
  it("accepts a distinct anon/target pair", () => {
    const parsed = recordAccountMergeInputSchema.parse({
      anonUserId: "anon-1",
      targetUserId: "target-1",
    });
    expect(parsed.anonUserId).toBe("anon-1");
    expect(parsed.targetUserId).toBe("target-1");
  });

  it("rejects an empty anon id", () => {
    expect(() =>
      recordAccountMergeInputSchema.parse({
        anonUserId: "",
        targetUserId: "target-1",
      }),
    ).toThrow();
  });

  it("rejects merging an account into itself", () => {
    expect(() =>
      recordAccountMergeInputSchema.parse({
        anonUserId: "same",
        targetUserId: "same",
      }),
    ).toThrow();
  });

  it("constrains status to the three known values", () => {
    expect(accountMergeStatusSchema.parse("pending")).toBe("pending");
    expect(accountMergeStatusSchema.parse("confirmed")).toBe("confirmed");
    expect(accountMergeStatusSchema.parse("discarded")).toBe("discarded");
    expect(() => accountMergeStatusSchema.parse("bogus")).toThrow();
  });
});
