import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../resource-gate.py", import.meta.url));
const quiet = {
  cpus: 8,
  load: 0,
  memory_mb: 16384,
  total_mb: 16384,
  pressure: "1",
};
let directory;
let processes;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ci-slots-"));
  processes = [];
});
afterEach(async () => {
  for (const child of processes) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  rmSync(directory, { recursive: true, force: true });
});

function environment(host = quiet, extra = {}) {
  return {
    ...process.env,
    GITHUB_ACTIONS: "false",
    CI_GATE_DIR: directory,
    CI_GATE_HOST_JSON: JSON.stringify(host),
    CI_GATE_TIMEOUT: "3",
    CI_GATE_INTERVAL: "0.05",
    ...extra,
  };
}

function decide(host, jobs = [], request = { cpus: 2, memory_mb: 2048 }) {
  const result = spawnSync(
    "python3",
    ["-B", script, "decide", JSON.stringify({ host, jobs, request })],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

function start(command, host = quiet, extra = {}) {
  const child = spawn(
    "python3",
    [
      "-B",
      script,
      "exec",
      "--goals",
      "ci-build",
      "--",
      "python3",
      "-c",
      command,
    ],
    { env: environment(host, extra) },
  );
  processes.push(child);
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, output }));
  });
  return { child, done };
}

async function waitForFile(path) {
  const deadline = Date.now() + 3000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error("Child did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("local resource scheduling", () => {
  test("waits when unrelated host CPU or memory is busy, including the first job", () => {
    expect(decide({ ...quiet, load: 7 }).fits).toBe(false);
    expect(decide({ ...quiet, memory_mb: 2048 }).fits).toBe(false);
    expect(decide({ ...quiet, pressure: "4" }).fits).toBe(false);
    expect(decide(quiet).fits).toBe(true);
  });
  test("reserves startup capacity without counting measured allocations twice", () => {
    const job = { cpus: 4, memory_mb: 4096, used_cpu: 2, used_memory_mb: 2048 };
    const result = decide({ ...quiet, load: 2, memory_mb: 14336 }, [job]);
    expect(result.free_cpu).toBe(4);
    expect(result.free_memory_mb).toBe(10650);
  });
  test("preserves command failure and releases its reservation", async () => {
    expect((await start("raise SystemExit(7)").done).code).toBe(7);
    expect(
      readdirSync(directory).filter((name) => name.endsWith(".json")),
    ).toEqual([]);
  });
  test("times out without starting a heavy command", async () => {
    const marker = join(directory, "started");
    const command = `from pathlib import Path; Path(${JSON.stringify(marker)}).touch()`;
    const result = await start(
      command,
      { ...quiet, load: 8 },
      { CI_GATE_TIMEOUT: "0" },
    ).done;
    expect(result.code).toBe(1);
    expect(result.output).toContain("command was not started");
    expect(existsSync(marker)).toBe(false);
    expect(
      readdirSync(directory).filter((name) => name.endsWith(".json")),
    ).toEqual([]);
  });
  test("GitHub CI bypasses the gate without reading resource metrics", async () => {
    const result = await start("raise SystemExit(0)", quiet, {
      GITHUB_ACTIONS: "true",
      CI_GATE_HOST_JSON: "invalid",
    }).done;
    expect(result.code).toBe(0);
    expect(result.output).toBe("");
    expect(readdirSync(directory)).toEqual([]);
  });
  test("lightweight targets bypass reservations on a busy laptop", () => {
    const result = spawnSync(
      "python3",
      [
        "-B",
        script,
        "exec",
        "--goals",
        "ci-policies",
        "--",
        "python3",
        "-c",
        "raise SystemExit(0)",
      ],
      { env: environment({ ...quiet, load: 8 }) },
    );
    expect(result.status).toBe(0);
    expect(readdirSync(directory)).toEqual([]);
  });
  test("removes stale records, including recycled process IDs", async () => {
    writeFileSync(
      join(directory, "stale.json"),
      JSON.stringify({
        pid: process.pid,
        started: "old process",
        state: "running",
      }),
    );
    expect((await start("raise SystemExit(0)").done).code).toBe(0);
    expect(existsSync(join(directory, "stale.json"))).toBe(false);
  });
  test("queues concurrent work until its predecessor releases capacity", async () => {
    const host = { ...quiet, cpus: 4 };
    const marker = join(directory, "ready");
    const first = start(
      `from pathlib import Path; import time; Path(${JSON.stringify(marker)}).touch(); time.sleep(0.5)`,
      host,
    );
    await waitForFile(marker);
    const second = start("raise SystemExit(0)", host);
    expect((await first.done).code).toBe(0);
    const result = await second.done;
    expect(result.code).toBe(0);
    expect(result.output).toContain("waiting for ci-build");
  });
  test("forwards cancellation to the child and frees its slot", async () => {
    const marker = join(directory, "ready");
    const task = start(
      `from pathlib import Path; import time; Path(${JSON.stringify(marker)}).touch(); time.sleep(30)`,
    );
    await waitForFile(marker);
    task.child.kill("SIGTERM");
    expect((await task.done).code).toBe(143);
    expect(
      readdirSync(directory).filter((name) => name.endsWith(".json")),
    ).toEqual([]);
  });
});
