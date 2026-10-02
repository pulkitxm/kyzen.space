import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { trackedContent, trackedFiles } from "./tracked-files.mjs";

const root = resolve(import.meta.dir, "..");
process.chdir(root);
const target = process.argv[2];
const ruff = join(root, ".ci-tools/bin/ruff");
const processes = new Set();
const containers = [];
const scratch = mkdtempSync(join(tmpdir(), "kyzen-ci-"));
const id = `kyzen-ci-${crypto.randomUUID().slice(0, 8)}`;
let compose;
let network = false;
const images = [];
let interrupted = false;
const synthetic = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/kyzen_ci",
  REDIS_URL: "redis://127.0.0.1:6379",
  BETTER_AUTH_SECRET: "synthetic-ci-session-secret-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_URL: "http://localhost:3000",
  PUBLIC_REALTIME_URL: "http://localhost:3000",
  API_URL: "http://localhost:3000",
  NEXT_PUBLIC_API_URL: "",
  NEXT_PUBLIC_SOCKET_URL: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  KLIPY_API_KEY: "",
  GENDERIZE_API_KEY: "",
  NOT_ALLOWED_USERNAMES: "",
  USERNAME_CHANGE_COOLDOWN_DAYS: "30",
  PRESENCE_HEARTBEAT_MS: "10000",
  PRESENCE_STALE_MS: "25000",
  PRESENCE_LASTSEEN_PERSIST_MS: "60000",
  DB_LATENCY_MS: "0",
  HOST: "0.0.0.0",
  PORT: "3000",
  NEXT_TELEMETRY_DISABLED: "1",
};

const env = { ...process.env, ...synthetic };
if (process.env.GITHUB_ACTIONS !== "true") {
  env.CIRCLE_NODE_TOTAL = "2";
  env.REACT_DOCTOR_PARALLEL = "2";
}

async function run(command, args = [], extra = {}, cwd = root) {
  if (interrupted) throw new Error("CI checks were interrupted");
  const child = Bun.spawn([command, ...args], {
    cwd,
    env: { ...env, ...extra },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  processes.add(child);
  const code = await child.exited;
  processes.delete(child);
  if (code) throw new Error(`${command} exited with status ${code}`);
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
  }).trim();
}

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (interrupted) throw new Error("CI checks were interrupted");
    if (await check()) return;
    await Bun.sleep(1000);
  }
  throw new Error(`${label} did not become ready`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function services() {
  const postgresPort = await freePort();
  const redisPort = await freePort();
  await run("docker", ["network", "create", id]);
  network = true;
  for (const [name, port, internal, image, options] of [
    [
      "postgres",
      postgresPort,
      5432,
      "postgres:16",
      [
        "-e",
        "POSTGRES_PASSWORD=postgres",
        "-e",
        "POSTGRES_DB=kyzen_ci",
        "--health-cmd",
        "pg_isready -U postgres -d kyzen_ci",
      ],
    ],
    ["redis", redisPort, 6379, "redis:7", ["--health-cmd", "redis-cli ping"]],
  ]) {
    const container = `${id}-${name}`;
    containers.push(container);
    await run("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--network",
      id,
      "--network-alias",
      name,
      "-p",
      `127.0.0.1:${port}:${internal}`,
      "--health-interval",
      "1s",
      "--health-retries",
      "30",
      ...options,
      image,
    ]);
    await waitFor(
      () =>
        capture("docker", [
          "inspect",
          "--format",
          "{{.State.Health.Status}}",
          container,
        ]) === "healthy",
      name,
    );
  }
  env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${postgresPort}/kyzen_ci`;
  env.REDIS_URL = `redis://127.0.0.1:${redisPort}`;
  await run("bun", ["run", "db:push", "--", "--force"]);
}

async function smoke() {
  await services();
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const image = `${id}:smoke`;
  images.push(image);
  const envFile = join(scratch, "synthetic.env");
  const containerEnv = {
    ...synthetic,
    DATABASE_URL: "postgres://postgres:postgres@postgres:5432/kyzen_ci",
    REDIS_URL: "redis://redis:6379",
    BETTER_AUTH_URL: origin,
    WEB_URL: origin,
    PUBLIC_REALTIME_URL: origin,
    API_URL: "http://127.0.0.1:3000",
    HOST: "0.0.0.0",
    PORT: "3000",
    NODE_ENV: "production",
  };
  writeFileSync(
    envFile,
    Object.entries(containerEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  const productionOverride = join(scratch, "production-compose.yaml");
  writeFileSync(
    productionOverride,
    `services:\n  app:\n    env_file: !override [${JSON.stringify(envFile)}]\n`,
  );
  await run("docker", [
    "compose",
    "-f",
    "compose.yaml",
    "-f",
    productionOverride,
    "config",
    "--quiet",
  ]);
  await run("docker", ["build", "--target", "production", "--tag", image, "."]);
  const app = `${id}-app`;
  containers.push(app);
  await run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    app,
    "--network",
    id,
    "-p",
    `127.0.0.1:${port}:3000`,
    "--env-file",
    envFile,
    image,
  ]);
  await verifyApp(origin);
  await run("docker", ["rm", "--force", app]);
  const override = join(scratch, "compose.yaml");
  const devPort = await freePort();
  const devOrigin = `http://localhost:${devPort}`;
  const postgresPort = await freePort();
  const redisPort = await freePort();
  writeFileSync(
    override,
    `services:\n  postgres:\n    ports: !override ["127.0.0.1:${postgresPort}:5432"]\n  redis:\n    ports: !override ["127.0.0.1:${redisPort}:6379"]\n  setup:\n    env_file: !override []\n  app:\n    env_file: !override []\n    ports: !override ["127.0.0.1:${devPort}:3000"]\n    environment:\n      BETTER_AUTH_URL: ${devOrigin}\n      WEB_URL: ${devOrigin}\n      PUBLIC_REALTIME_URL: ${devOrigin}\n`,
  );
  compose = [
    "compose",
    "--project-name",
    `${id}-dev`,
    "-f",
    "compose.dev.yaml",
    "-f",
    override,
  ];
  await run("docker", [...compose, "config", "--quiet"]);
  await run("docker", [...compose, "up", "--build", "--detach"]);
  await verifyApp(devOrigin);
  await run("docker", [
    ...compose,
    "exec",
    "-T",
    "app",
    "bun",
    "run",
    "db:seed",
  ]);
  await run("bun", ["run", "--cwd", "apps/web", "smoke:game"], {
    SMOKE_ORIGIN: devOrigin,
  });
  console.log(
    "Production and development smoke flows passed with synthetic players.",
  );
}

async function verifyApp(origin) {
  await waitFor(async () => {
    try {
      const response = await fetch(`${origin}/health`);
      const body = await response.json();
      return (
        response.ok &&
        body.db === "ok" &&
        body.redis === "ok" &&
        body.probe === "ok"
      );
    } catch {
      return false;
    }
  }, "combined app");
  await run("bun", ["run", "--cwd", "apps/web", "smoke:game"], {
    SMOKE_ORIGIN: origin,
  });
}

async function pythonTools() {
  if (existsSync(ruff)) return;
  await run("python3", ["-m", "venv", ".ci-tools"]);
  await run(join(root, ".ci-tools/bin/python3"), [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "ruff==0.16.10",
  ]);
}

async function tool(command, args, image, directory = root) {
  if (Bun.which(command)) await run(command, args, {}, directory);
  else
    await run("docker", [
      "run",
      "--rm",
      "-v",
      `${directory}:/repo`,
      "--workdir",
      "/repo",
      image,
      ...args,
    ]);
}

const tasks = {
  "ci-install": () => run("bun", ["install", "--frozen-lockfile"]),
  "ci-policies": async () => {
    for (const check of [
      "check:comments",
      "check:em-dashes",
      "check:repository",
    ])
      await run("bun", ["run", check]);
  },
  "ci-lint": async () => {
    await run("bun", ["run", "lint"]);
    await run("bun", ["run", "fix:tw:check"]);
  },
  "ci-format": () => run("bun", ["run", "format:check"]),
  "ci-types": () =>
    run("bun", ["run", "type-check", "--", "--force", "--concurrency=2"]),
  "ci-test": () =>
    run("bun", ["run", "test", "--", "--force", "--concurrency=2"]),
  "ci-build": () =>
    run("bun", ["run", "build", "--", "--force", "--concurrency=2"]),
  "ci-dead-code": () => run("bun", ["run", "dead-code"]),
  "ci-audit": () => run("bun", ["audit", "--audit-level=high"]),
  "ci-workflows": () => tool("actionlint", [], "rhysd/actionlint:1.7.12"),
  "ci-secrets": async () => {
    const directory = join(scratch, "tracked");
    for (const file of trackedFiles()) {
      const target = join(directory, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, trackedContent(file));
    }
    await tool(
      "gitleaks",
      ["dir", ".", "--redact", "--no-banner"],
      "ghcr.io/gitleaks/gitleaks:v8.30.1",
      directory,
    );
  },
  "ci-scripts": async () => {
    await pythonTools();
    await run(ruff, ["check", "scripts/resource-gate.py"]);
    await run(ruff, ["format", "--check", "scripts/resource-gate.py"]);
    await run("bun", ["run", "test:policies"]);
  },
  "ci-integration": async () => {
    await services();
    await run("bun", ["run", "--cwd", "apps/server", "test:integration"]);
  },
  "ci-smoke": smoke,
  "ci-react": () =>
    run("bunx", [
      "react-doctor@0.9.14",
      ".",
      "--yes",
      "--project",
      "*",
      "--scope",
      "full",
      "--blocking",
      "warning",
      "--no-telemetry",
      "--no-supply-chain",
    ]),
  "ci-tools": async () => {
    await pythonTools();
    await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
    console.log(
      "Bun, Python, Ruff and Docker are ready. Scanner tools use installed binaries or pinned containers.",
    );
  },
  help: async () => {
    console.log(
      "make ci runs every check, including disposable Docker integration and smoke environments.\nmake ci-tools verifies prerequisites.\nIndividual targets: " +
        Object.keys(tasks)
          .filter((name) => name !== "help")
          .join(" ") +
        "\nHeavy local targets wait for CPU and memory. GitHub Actions bypasses that wait.\nCI_GATE_TIMEOUT (900s), CI_GATE_INTERVAL (5s), CI_GATE_DIR control local scheduling.",
    );
  },
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    for (const child of processes) child.kill(signal);
  });
}

try {
  if (!tasks[target]) throw new Error(`Unknown CI target: ${target}`);
  await tasks[target]();
  console.log(`${target}: passed`);
} catch (error) {
  console.error(error.message);
  for (const container of containers)
    Bun.spawnSync(["docker", "logs", "--tail", "80", container], {
      stdout: "inherit",
      stderr: "inherit",
    });
  if (compose)
    Bun.spawnSync(["docker", ...compose, "logs", "--tail", "80"], {
      cwd: root,
      env,
      stdout: "inherit",
      stderr: "inherit",
    });
  process.exitCode = 1;
} finally {
  if (compose) {
    Bun.spawnSync(
      [
        "docker",
        ...compose,
        "down",
        "--volumes",
        "--remove-orphans",
        "--rmi",
        "local",
      ],
      { cwd: root, env, stdout: "inherit", stderr: "inherit" },
    );
  }
  for (const container of containers.reverse())
    Bun.spawnSync(["docker", "rm", "--force", container], {
      stdout: "ignore",
      stderr: "ignore",
    });
  for (const image of images)
    Bun.spawnSync(["docker", "image", "rm", image], {
      stdout: "ignore",
      stderr: "ignore",
    });
  if (network)
    Bun.spawnSync(["docker", "network", "rm", id], {
      stdout: "ignore",
      stderr: "ignore",
    });
  rmSync(scratch, { recursive: true, force: true });
}
