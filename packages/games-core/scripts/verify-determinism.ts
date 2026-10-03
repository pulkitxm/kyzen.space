import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOLDEN, measure } from "../tests/tank-arena-golden";

const results = measure();

async function nodeResults(): Promise<Record<string, number> | null> {
  const directory = mkdtempSync(join(tmpdir(), "kyzen-tank-arena-"));
  try {
    const build = await Bun.build({
      entrypoints: [import.meta.path],
      outdir: directory,
      target: "node",
      format: "esm",
      naming: "verify.mjs",
    });
    if (!build.success) return null;
    const run = spawnSync("node", [join(directory, "verify.mjs"), "--emit"], {
      encoding: "utf8",
    });
    if (run.status !== 0) return null;
    return JSON.parse(run.stdout) as Record<string, number>;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes("--emit")) {
  console.log(JSON.stringify(results));
} else {
  const node = await nodeResults();
  let failed = 0;
  for (const [name, expected] of Object.entries(GOLDEN)) {
    const bun = results[name];
    const viaNode = node?.[name];
    const ok = bun === expected && viaNode === expected;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${name.padEnd(10)} golden ${expected} bun ${bun} node ${viaNode ?? "unavailable"}`,
    );
  }
  if (failed > 0) {
    console.error(`${failed} determinism check(s) failed`);
    process.exit(1);
  }
  console.log("bun and node reproduce every golden checksum");
}
