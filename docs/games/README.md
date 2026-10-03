# Game docs

Every game ships a doc at `docs/games/<type>.md`, named after the game type
slug (the `meta.type` declared in its `GameDefinition`). The doc describes the
rules, player count and roles, win/draw/illegal-move conditions, and the state,
move, and config shapes for that game.

This convention is enforced: `packages/games-core/tests/game-docs.test.ts`
asserts that a `docs/games/<type>.md` file exists for every type in the `GAMES`
registry, so adding a game without its doc fails the suite.

## Architecture docs

- [Architecture overview](../architecture/README.md)
- [Adding a game](../adding-a-game.md)

## Current games

- [tank-arena](./tank-arena.md)
- [tic-tac-toe](./tic-tac-toe.md)
