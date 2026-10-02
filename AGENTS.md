# Working on Kyzen

Read [README.md](README.md) for commands and [docs/architecture/README.md](docs/architecture/README.md) for the map. For a game, start with [docs/adding-a-game.md](docs/adding-a-game.md). Read subsystem docs only when changing that subsystem.

## Boundaries

- `apps/web`: Next.js routes and the shared play shell. The shell mounts boards, chat, profile popups, settings, and results.
- `apps/server`: server-only API, auth, chat services, and realtime handlers. `src/http.ts` mounts these on the Next.js HTTP server or runs separately.
- `packages/games-core`: pure game engines and metadata. No React, network calls, or database access.
- `packages/games-client`: boards and shared board primitives. Boards receive state, moves, and `makeMove`; they never manage sockets.
- `packages/shared`: wire contracts, shared constants, and Zod schemas. This is the only package that imports `zod`. Keep local presentation types beside their implementation; do not put every private type into shared.
- `packages/database`: schema, migrations, repositories, and local seeds. Only server code uses it.
- `packages/avatar`: avatar options and validation.

## Adding a game

Add the game's schemas, engine, metadata, board, tests, and rules document. Update the slug, engine, and board registrations listed in `docs/adding-a-game.md`. Reuse the generic routes, session, chat layouts, profile popups, audio, and database tables. Never create a game-specific socket event, API endpoint, or table for a turn-based game.

Only turn-based games currently have a server runner. Adding a `step` engine alone does not implement realtime gameplay. Extend the platform explicitly if that capability is needed.

## Style

- No comments in code. Functional tooling directives and license blocks are allowed.
- No em dash characters in new output.
- No generated attribution in code, commits, or PR text.
- Use `react-icons/fa6` for icons, then another `react-icons` pack if needed.
- Use Jotai for cross-feature application state. A mounted session can own state in its shell and pass props to children; keep private UI state local.
- Use the existing glass and popup primitives for popup surfaces.
- Add new top-level route names to `RESERVED_USERNAMES` in shared constants.
- Before changing Next.js APIs, read the matching guide in the installed package's `dist/docs/` folder when available, or use the official Next.js documentation.

## Verification

Run `bun run type-check`, the touched workspaces' tests, `bun run check`, and `bun run strip-comments -- --check`. For runtime changes, also build and exercise HTTP, auth, and an authenticated two-player game. Document missing environment dependencies instead of claiming a check passed.

Use an isolated worktree. Commit coherent checkpoints through Pukbot, after staging only the relevant files. Read `pukbot capabilities --json` and command help first. Use Pukbot for GitHub writes. PR descriptions are one line. Merge only with a squash and branch deletion.

Visual evidence must come from a fresh synthetic-data run. Post finished evidence separately from the PR description. Never share real project data or credentials.

## Documentation and roles

Keep the matching architecture doc current. Game-authoring changes update `docs/adding-a-game.md`; game rules update `docs/games/<slug>.md`. Deployment changes update `docs/deployment.md`.

The role adapters under `.claude/agents/` and `.codex/agents/` point to these same documents. Put the workflow in the documents, not in multiple copies of an agent prompt. Tutorial video work uses `docs/video-tutorials.md` and the existing tutorial role.
