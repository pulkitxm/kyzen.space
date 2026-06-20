import { describe, expect, it } from "bun:test";
import { ping } from "@kyzen/database";
import { DB_UP } from "./harness";

describe.skipIf(!DB_UP)("database ping", () => {
  it("resolves when the database is reachable", async () => {
    await expect(ping()).resolves.toBeUndefined();
  });
});
