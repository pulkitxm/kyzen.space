import { describe, expect, it } from "bun:test";
import { validateChatModePref } from "../src/types";

describe("validateChatModePref", () => {
  it("rejects non-objects", () => {
    for (const v of [null, undefined, "x", 5, true, []])
      expect(validateChatModePref(v)).toBeNull();
  });

  it("defaults an unknown or missing mode to mounted", () => {
    expect(validateChatModePref({})).toEqual({ mode: "mounted" });
    expect(validateChatModePref({ mode: "weird" })).toEqual({
      mode: "mounted",
    });
  });

  it("keeps a valid popout mode", () => {
    expect(validateChatModePref({ mode: "popout" })).toEqual({
      mode: "popout",
    });
  });

  it("ignores any geometry fields (device-local, never stored)", () => {
    expect(
      validateChatModePref({
        mode: "popout",
        chatWidth: 999,
        popout: { x: 1 },
      }),
    ).toEqual({ mode: "popout" });
  });
});
