# Contributing to Kyzen

Bug fixes, new games, documentation, and platform improvements are welcome. Read the [README](README.md) for the repository map and [repository conventions](AGENTS.md) before making changes.

## License and contributions

Kyzen uses the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Contributions are accepted under the same license. Submit only work you own or have permission to contribute under these terms, and preserve third-party licenses and required notices. This is source-available software with noncommercial restrictions; publishing the code does not authorize commercial redistribution or monetized hosting. The full license, including its expressly permitted organizational uses, governs.

## Report a bug or propose a change

Search [existing issues](https://github.com/pulkitxm/kyzen.space/issues) and [pull requests](https://github.com/pulkitxm/kyzen.space/pulls) first. For a bug, include reproducible steps, expected and actual behavior, browser or runtime versions, and relevant sanitized output. Use synthetic examples instead of real messages, profiles, or account data.

For a substantial feature or architecture change, open an issue to agree on scope before implementation. Small fixes and documentation corrections can go directly to a pull request. Keep discussions respectful, specific, and focused on the change.

Do not report exploitable vulnerabilities or credentials in a public issue. Contact the [maintainer](https://github.com/pulkitxm) privately to arrange a disclosure channel before sharing sensitive details.

## Set up a local environment

Fork the repository and create a focused branch from the latest `main`. Maintainers can use an isolated worktree instead. Install the Bun version in the root `package.json` and Docker with Compose Watch support.

The simplest local setup is:

```bash
docker compose -f compose.dev.yaml up --build --watch
```

Open http://localhost:3000 and continue as a guest. The local stack starts Postgres and Redis, applies the development schema, and seeds synthetic demo data. Use two independent browser sessions to test multiplayer and chat.

For host development:

```bash
bun install --frozen-lockfile
cp .env.example .env
bun run db:start
bun run db:push
bun run db:seed
bun run dev
```

Use only a local development database for schema pushes and seeds. Keep credentials in the ignored root `.env`; never commit them. See [deployment and local development](docs/deployment.md) for port overrides, environment settings, and runtime options.

## Implement the change

Follow the boundaries in [AGENTS.md](AGENTS.md). Pure game rules belong in `packages/games-core`, boards in `packages/games-client`, shared contracts in `packages/shared`, and persistence in `packages/database`. Boards use the shared session and move callback rather than managing sockets themselves.

For a new game, follow [adding a game](docs/adding-a-game.md), including registrations, rules, and tests. For platform work, start with the [architecture map](docs/architecture/README.md) and update the affected subsystem documentation alongside the implementation.

Keep changes focused and use coherent commits. Write code without comments, except permitted functional directives and license blocks. Remove debugging output, focused tests, conflict markers, and unused code. Do not add em dash characters.

## Verify locally

Run these from the repository root before opening a pull request:

```bash
bun run check
bun run fix:tw:check
bun run type-check
bun run test
bun run strip-comments -- --check
bun run dead-code
```

Use `bun run fix` when formatting or lint fixes are needed, then repeat the read-only checks. Tests should exercise changed behavior and regressions; see the [testing guide](docs/architecture/testing.md) for existing patterns and workspace-specific commands.

For changes to server behavior or persistence, apply the development schema and run integration tests with local Postgres and Redis available:

```bash
bun run db:push
bun run --cwd apps/server test:integration
```

For runtime or UI changes, also run `bun run build` and exercise the affected flow. With the combined app running against local synthetic data, this verifies guest sign-in, authenticated sockets, complete tic-tac-toe and Tank Arena games (a private team lobby with a bot, public 1v1 and 2v2 matches), hidden-plan redaction, reconnect recovery, and persisted completion:

```bash
bun run --cwd apps/web smoke:game
```

## Open a pull request

Target `main` and keep the diff focused on one coherent outcome. Use a descriptive title and a single-line description stating the problem and resulting behavior. Put implementation details and validation results in commit messages. Explain checks you could not run without claiming they passed.

For user-facing changes, post finished evidence in a separate PR comment after verification. One comment is the default. Capture the actual product using synthetic fixtures only; never upload real project data, credentials, or original captures containing them. Use a screenshot or short recording for UI work and sanitized final output for CLI or backend work. Documentation-only changes do not need an evidence comment.

## CI and review

The existing workflows provide these checks:

| Check | What it verifies |
| --- | --- |
| Lint | Biome formatting and lint, Tailwind canonical classes, TypeScript types |
| Test | Workspace unit tests and Postgres/Redis integration tests |
| Build | All workspace builds |
| Smoke | Production image, local Compose stack, HTTP readiness, realtime connections, authenticated games, and reconnects |
| No code comments | Disallowed comments are absent |
| No em dashes | The prohibited character is absent from tracked files |
| No leftovers | No source `console.log`, debugger statements, focused tests, conflict markers, or tracked secrets files |
| Dead code | Unused code and dependencies |
| No secrets | Gitleaks working-tree scan |
| Dependency audit | High and critical advisories when manifests or the lockfile change, plus scheduled scans |
| Workflow lint | Actionlint when workflow files change |
| React Doctor | React diagnostics and review feedback |

Read the Actions logs and review feedback, fix failures, and wait for the applicable checks to pass before merging. CI complements local verification and review. Maintainers squash merge accepted pull requests and delete the source branch.
