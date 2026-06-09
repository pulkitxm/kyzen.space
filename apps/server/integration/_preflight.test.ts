import { describe, expect, it } from "bun:test";
import { DB_UP } from "./harness";

const SETUP_HELP = [
  "Integration tests need a reachable Postgres and could not connect.",
  "Checklist:",
  "(1) DATABASE_URL and BETTER_AUTH_SECRET must be set",
  "(a missing one throws 'Missing required env var' before this check);",
  "(2) Postgres must be running - `bun run db:start` locally,",
  "or a `postgres` service in CI;",
  "(3) apply the schema with `bun run db:push`.",
].join(" ");

describe("integration preflight", () => {
  it("can reach the database (does not silently skip the suite)", () => {
    if (!DB_UP) throw new Error(SETUP_HELP);
    expect(DB_UP).toBe(true);
  });
});
