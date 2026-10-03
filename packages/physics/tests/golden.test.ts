import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { GOLDEN, measure } from "./golden";

describe("golden checksums", () => {
  test("bun reproduces every golden checksum twice in a row", () => {
    expect(measure()).toEqual(GOLDEN);
    expect(measure()).toEqual(GOLDEN);
  });

  test("node reproduces every golden checksum", () => {
    const run = spawnSync(
      "bun",
      [join(import.meta.dir, "..", "scripts", "verify-determinism.ts")],
      { encoding: "utf8" },
    );
    expect(run.stdout).toContain(
      "bun and node reproduce every golden checksum",
    );
    expect(run.status).toBe(0);
  }, 30_000);
});
