import { existsSync, watch } from "node:fs";
import { type Subprocess, spawn } from "bun";

const COMMAND = ["bun", "--env-file=../../.env", "server.ts"];
const WATCHED = [
  "server.ts",
  "../server/src",
  "../../packages/database/src",
  "../../packages/games-core/src",
  "../../packages/shared/src",
  "../../packages/avatar/src",
  "../../.env",
];
const RELEVANT = /(\.ts|\.json|\.env)$/;
const RESTART_DELAY_MS = 200;

let server: Subprocess | null = null;
let pending: ReturnType<typeof setTimeout> | undefined;
let stopping = false;

function start(): void {
  const child = spawn(COMMAND, { stdio: ["inherit", "inherit", "inherit"] });
  server = child;
  void child.exited.then((code) => {
    if (server !== child || stopping) return;
    server = null;
    console.info(`[dev] server exited with code ${code}, waiting for changes`);
  });
}

async function stopServer(): Promise<void> {
  const child = server;
  server = null;
  if (!child) return;
  child.kill("SIGTERM");
  await child.exited;
}

function scheduleRestart(file: string): void {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    console.info(`[dev] restarting after a change to ${file}`);
    await stopServer();
    if (!stopping) start();
  }, RESTART_DELAY_MS);
}

for (const path of WATCHED.filter((entry) => existsSync(entry))) {
  watch(path, { recursive: true }, (_event, file) => {
    const changed = file ? `${path}/${file}` : path;
    if (RELEVANT.test(changed)) scheduleRestart(changed);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    stopping = true;
    clearTimeout(pending);
    await stopServer();
    process.exit(0);
  });
}

start();
