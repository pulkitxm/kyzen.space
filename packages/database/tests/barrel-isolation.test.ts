import { describe, expect, mock, test } from "bun:test";
import * as realBarrel from "../src/index";
import * as inviteTokenModule from "../src/invite-token";

describe("barrel mock does not write through to source modules", () => {
  test("mocking ../src/index leaves the real ../src/invite-token unpoisoned", async () => {
    expect(inviteTokenModule.generateInviteToken().length).toBe(43);

    mock.module("../src/index", () => ({
      ...realBarrel,
      generateInviteToken: () => "POISON",
    }));

    const directAfterMock = (
      await import("../src/invite-token")
    ).generateInviteToken();
    expect(directAfterMock).not.toBe("POISON");
    expect(directAfterMock.length).toBe(43);
    expect(directAfterMock).toMatch(/^[A-Za-z0-9_-]+$/);

    expect((await import("../src/index")).generateInviteToken()).toBe("POISON");

    mock.module("../src/index", () => realBarrel);
  });
});
