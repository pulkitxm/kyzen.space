# Running CI checks

Run `make ci` for the complete suite. GitHub runs the same Make targets on every pull request and push to `main`, plus a weekly audit run. There are no path filters or local Git hooks. `CI required` fails if any mandatory target fails, is cancelled, or is skipped.

Install Bun at the version in `package.json`, Make, Python 3.9 or newer, and a running Docker engine. The smoke flow needs Docker Compose 2.24.4 or newer because its isolated port mappings use [Compose replacement tags](https://docs.docker.com/reference/compose-file/merge/). Run `make ci-tools` to verify prerequisites. Ruff 0.16.10 is installed into the ignored `.ci-tools` virtual environment when needed. Workflow lint and secret scanning use installed tools, or pinned Docker images when binaries are unavailable.

| Target | Check |
| --- | --- |
| `make ci-install` | Frozen dependency installation |
| `make ci-policies` | Comments, U+2014, local hook tooling, tracked env files, merge markers |
| `make ci-lint` | Strict Biome lint and import ordering, canonical Tailwind classes |
| `make ci-format` | Biome formatting |
| `make ci-types` | Every workspace's TypeScript checks |
| `make ci-test` | Every workspace's unit and contract tests |
| `make ci-scripts` | Ruff lint/format and policy/scheduler regression tests |
| `make ci-dead-code` | Knip unused code and dependencies |
| `make ci-audit` | High and critical dependency advisories |
| `make ci-workflows` | Actionlint workflow validation |
| `make ci-secrets` | Redacted Gitleaks scan of tracked files |
| `make ci-build` | All workspace builds |
| `make ci-integration` | Database and Redis integration tests |
| `make ci-smoke` | Production image and seeded development Compose game flows |
| `make ci-react` | Full-workspace React Doctor scan, failing on errors and warnings, without telemetry or PR comments |

All quality gates are blocking. React Doctor checks every discovered React workspace and fails on any error or warning; it complements Biome. Scanner execution failures also fail its target. Turbo checks use `--force` so a previous task result cannot hide a broken check.

## Local resource scheduling

Heavy targets on macOS and Linux reserve CPU and memory before starting. Concurrent invocations and worktrees share `~/.cache/kyzen/ci-slots`, protected by an OS file lock. The oldest waiting invocation starts first when its CPU and memory budget fits. Lightweight targets such as `ci-policies`, `ci-lint`, and `ci-format` run immediately. Invoking several targets together reserves the largest target's budget and runs them sequentially.

The scheduler measures host load, available memory, and memory pressure. It also accounts for live child-process CPU and memory so startup reservations are not counted twice once allocations become visible. It waits even for the first job when unrelated work has already exhausted the host budget. Full `ci` and smoke runs reserve 4 CPUs and 6 GB; builds reserve 4 CPUs and 4 GB. Type checks and tests reserve smaller budgets. CPU requests shrink to fit smaller machines. Local Next.js and React Doctor worker counts are limited to two, and Turbo runs at most two workspace tasks at once.

The gate prints why it is waiting every five seconds. The default deadline is fifteen minutes; reaching it fails without launching the command. `CI_GATE_TIMEOUT`, `CI_GATE_INTERVAL`, and `CI_GATE_DIR` adjust the deadline, poll interval, and shared reservation directory. Stale records are removed using both process IDs and start times. Cancellation forwards the signal to the child process group and releases the reservation. The child command's exit status is preserved.

`GITHUB_ACTIONS=true` bypasses resource scheduling completely. For a deliberate local diagnostic run, `make CI_RESOURCE_GATE_ACTIVE=1 ci-types` also bypasses it. `CI_GATE_HOST_JSON` supplies a deterministic resource snapshot for scheduler tests.

## Isolated runtime checks

Integration tests create disposable Postgres and Redis containers with unique names and temporary ports, apply the schema, run the real integration suite, then clean up. Smoke tests build and boot the production image, verify database/Redis health and the Redis probe, and run two authenticated synthetic players through a complete game and reconnect. They then run the same flow against the development Compose setup, including reseeding.

Every runtime invocation has its own network, containers, volumes, credentials, and synthetic fixtures. It does not use the development database or modify a local `.env`. Development Compose overrides remove local env-file inputs and replace all published ports. Containers, temporary images, volumes, and scratch files are removed after success or failure.

The secret scanner copies only tracked file content into an isolated scan directory. It does not follow symlinks or scan local secrets, dependency caches, or ignored files. Diagnostics stay in Actions logs and check results; the workflow does not publish raw logs into PR comments.
