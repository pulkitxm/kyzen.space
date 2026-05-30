/**
 * Runs docker compose for the local Postgres service.
 * Host port is taken from DATABASE_URL in .env (single source of truth).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is missing. Set it in .env (see .env.example).");
  process.exit(1);
}

let hostPort: string;
try {
  const url = new URL(databaseUrl);
  hostPort = url.port || "5432";
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const composeArgs = process.argv.slice(2);
if (composeArgs.length === 0) {
  console.error("Usage: bun scripts/db-compose.ts <docker compose args...>");
  process.exit(1);
}

function postgresReachable(url: string): boolean {
  const probe = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      "postgres:16-alpine",
      "psql",
      url,
      "-c",
      "SELECT 1",
    ],
    { encoding: "utf-8", timeout: 15_000 },
  );
  return probe.status === 0;
}

const isStart = composeArgs.includes("up");
if (isStart) {
  const check = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `publish=${hostPort}`,
      "--format",
      "{{.Names}}\t{{.Ports}}",
    ],
    { encoding: "utf-8" },
  );
  const lines = (check.stdout ?? "")
    .trim()
    .split("\n")
    .filter(Boolean);
  const blocked = lines.filter(
    (line) => !line.startsWith("gamelobby-postgres"),
  );
  if (blocked.length > 0) {
    if (postgresReachable(databaseUrl)) {
      console.log(
        `Postgres already on port ${hostPort} and DATABASE_URL connects — skipping container start.`,
      );
      process.exit(0);
    }
    console.error(
      `Port ${hostPort} (from DATABASE_URL) is already in use:\n${blocked.join("\n")}`,
    );
    console.error(
      "Stop the other Postgres, fix DATABASE_URL credentials to match it, or use another port in DATABASE_URL.",
    );
    process.exit(1);
  }
}

const result = spawnSync(
  "docker",
  [
    "compose",
    "--env-file",
    ".env",
    "-f",
    "scripts/docker-compose.yml",
    ...composeArgs,
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, GAMELOBBY_DB_PORT: hostPort },
  },
);

process.exit(result.status ?? 1);
