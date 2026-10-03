# physics: Deterministic 2D Physics

## What this is

`@kyzen/physics` (`packages/physics`) is a small, game-agnostic 2D physics package with no React, network, or database code and no runtime dependencies. Its one rule is that the same inputs produce bit-identical results on every JavaScript engine, so a server running Bun and a browser running V8 or JavaScriptCore replay the same simulation exactly.

Tank Arena is the only user today. Every round builds one `World`, and all tank motion, shots, shields, walls, mines, pickups, blasts, previews, and bot searches run through it. There is no second physics implementation in the game.

The package provides:

- `Terrain`: static axis-aligned boxes in a horizontal cell grid, optionally wrapped so the left and right edges are portals.
- `World`: dynamic boxes, bullets, and static bodies stepped at a fixed time step, with contacts, sensors, events, impulses, raycasts, and line of sight.
- Deterministic math: polynomial `dsin`, `dcos`, `datan2`, `normalizeAngle`, `round4`, a seeded Mulberry32 generator (`deriveRng`), ChaCha20-based secrets (`deriveSecret`, `secretWord`, `secretRng`), and `checksum`, a 32-bit hash of the exact float64 bits of a list of numbers.
- Geometry helpers: `wrapX`, `wrapDelta`, point sweeps against boxes, circles, and segments, `boxDistance`, `boxTouchesCircle`, and `boxesOverlap`.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/physics/src/math.ts` | Polynomial trig, angle and rounding helpers, PRNG, ChaCha20, `checksum` |
| `packages/physics/src/geometry.ts` | Wrapping and swept point tests, distances, overlaps |
| `packages/physics/src/terrain.ts` | `Terrain`: static boxes in a cell grid, casts, line of sight, contact limits, support |
| `packages/physics/src/world.ts` | `World`: bodies, the fixed step, bullets, sensors, followers, events, impulses, queries |
| `packages/physics/src/types.ts` | Shapes, body definitions, `Body`, `PhysicsEvent`, `RayHit` |
| `packages/physics/tests/` | Unit tests per module and the golden checksums (`golden.ts`) |
| `packages/physics/scripts/verify-determinism.ts` | Checks the goldens under Bun and under Node |
| `packages/games-core/src/games/tank-arena/world.ts` | Tank Arena's bodies, layers, shot rules, and traces on top of the package |

## Determinism contract

- Only `+ - * /`, `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.round`, `Math.abs`, `Math.min`, `Math.max`, and `Math.imul` (all exactly specified by IEEE 754 and ECMAScript). Never `Math.sin`, `Math.cos`, `Math.atan2`, `Math.pow`, `**`, `Math.random`, `Date`, or `performance` in simulation code. A test scans `packages/physics/src` and the Tank Arena engine folder for this.
- Trigonometry is polynomial: angles are folded into 0 to 45 degrees and evaluated with fixed Taylor series, accurate to about 1e-10.
- A fixed time step. The world never takes a variable `dt`.
- Stable iteration order: bodies step in creation order, grid cells and their bodies are visited in a fixed order, and ties between equally early contacts keep the first candidate (terrain before bodies).
- Persisted values are quantized (Tank Arena rounds positions to 4 decimals and adds `0` to turn `-0` into `0`), so a reloaded state is exactly the state the next round starts from.

The golden checksums in `packages/physics/tests/golden.ts` cover trig, the generators, ChaCha20, secrets, and two seeded worlds (wrapped and bounded) with landings, bullets, sensors, and impulses. `bun run --cwd packages/physics verify` computes them under Bun, bundles itself for Node, runs that bundle, and fails unless both runtimes reproduce every value. The test suite runs the same script, so `bun run test` checks both engines. `packages/games-core/scripts/verify-determinism.ts` does the same for a scripted four-player Tank Arena match and for repeated jumps.

## Terrain

```ts
const terrain = new Terrain({
  boxes: [{ minX: 0, minY: -3, maxX: 13, maxY: 0 }],
  width: 64,
  wrap: true,
  cellWidth: 8,
});
```

The width is split into whole cells (`cellWidth` is rounded so the cells tile the width). Each box is stored in every cell it overlaps; with `wrap`, a box that crosses the seam is stored as an image in the cells on the other side. Queries walk the cells under their horizontal span and shift each cell by whole widths, so every periodic image is seen and a fast cast that crosses the seam several times still finds the first box. Without `wrap`, queries outside the width use the edge cells. Terrain is immutable, so Tank Arena caches one per map size and shares it between the round, previews, and bot searches.

## Bodies

```ts
const world = new World<Entity>({
  terrain,
  gravity: 30,
  dt: 1 / 60,
  killY: -6,
  restSpeed: 0.05,
  restSteps: 20,
});

const tank = world.createBody({
  kind: "dynamic",
  shape: { type: "box", halfWidth: 1.4, halfHeight: 1.2 },
  x: 7,
  y: 1.2,
  mass: 1.8,
  friction: 7 / 15,
  restitution: 0.15,
  layer: TANK,
  mask: SHOT | MINE | PICKUP,
  group: 1,
  data: { type: "tank", index: 0 },
});
```

There are three kinds:

- **`dynamic`**: an axis-aligned box with a positive mass. It falls, collides with terrain, slides, and rests. Dynamic bodies do not collide with each other; games resolve body-to-body effects through sensors, bullets, and impulses. Tank Arena tanks therefore pass through one another.
- **`bullet`**: a point with a mass (default 1) and a gravity scale. It is swept every step and stops at the first collider it reaches.
- **`static`**: a box, circle, or segment that never moves on its own. It can be a `sensor`, and it can `follow` another body, in which case it takes that body's position at creation and after every step and is destroyed with it.

Every body has `data` for the game, a `layer` bit set, a `mask` of layers it accepts, and a `group`. Two bodies interact only when each one's layer is in the other's mask and they are not in the same nonzero group. Tank Arena puts each team in its own group, so shots, shields, and walls ignore their own team.

## The step

`world.step()` advances one fixed step and returns the events it produced, in order:

1. **Dynamic bodies** (creation order, sleeping ones skipped), with semi-implicit Euler:
   - Friction first: a supported body loses `friction * gravity * gravityScale * dt` of horizontal speed, stopping at zero. This is Coulomb friction against the resting normal force (the support pushes back with exactly the body's weight), so a body slides `v^2 / (2 * friction * gravity)` before it stops.
   - Gravity: `vy -= gravity * gravityScale * dt`.
   - Move along x by `vx * dt`. The terrain returns the nearest face between the leading edge and the target among boxes that overlap the body vertically; on contact the body stops at the face and `vx` becomes `-vx * restitution`.
   - Move along y by `vy * dt` the same way. Hitting a ceiling reflects `vy` with restitution. Landing on a top face places the body exactly on it, sets `vy = 0`, and marks it `supported`; landings are inelastic so a body settles on its first touch instead of bouncing in place.
   - Wrap through the portals (`wrap` event), drop out below `killY` (`fall` event, the body and its followers are destroyed), report `land` when an airborne body became supported, and count rest steps: a supported body slower than `restSpeed` for `restSteps` steps sleeps until an impulse or launch wakes it.
2. **Followers** take their target's position and the body grid is rebuilt if any body changed cell.
3. **Bullets** (creation order): gravity, then a sweep of the segment from the current position to `position + velocity * dt` against terrain and every accepted body in the cells it spans, using each body's nearest image across the seam. The earliest contact wins. The bullet stops at the contact point with its velocity unchanged and a `hit` event reports the other body (or `null` for terrain) and the surface normal. The game must remove or redirect it. Without a contact it moves, wraps, and falls out below `killY`. Because the whole segment is swept, bullets never tunnel, whatever their speed. Bullets do not collide with other bullets. Sensors count as colliders for bullets; a bullet that starts inside a sensor circle hits it at once, while a solid circle (a hollow shell) is only hit from outside.
4. **Sensors**: every dynamic body reports a `sensor` event for each accepted sensor box or circle it overlaps, every step it overlaps.

Support is stable on ledge edges: a body is supported while its bottom overlaps a top face by more than 1e-6 m horizontally and lies within 1e-3 m of it, and a resting body has no velocity, so it neither jitters nor creeps.

## Impulses and queries

- `applyImpulse(body, ix, iy)` adds `impulse / mass` to the velocity, wakes the body, and lifts it off its support when the impulse points up. The same impulse moves a heavier body less.
- `launch(body, vx, vy)` replaces the velocity (any drift is discarded), leaves the support, and wakes the body, so the same launch from the same position always produces the same path.
- `raycast(x0, y0, dx, dy, filter)` returns the first hit along the segment with its point, normal, and body (`null` for terrain), or `null`.
- `lineOfSight(x0, y0, x1, y1, inset)` is true when no terrain box, shrunk by `inset`, crosses the segment.
- `delta(from, to)` and `wrapPosition(x)` measure and wrap across the portals; `settled()` is true when no bullets remain and every dynamic body sleeps.

## How Tank Arena uses it

`packages/games-core/src/games/tank-arena/world.ts` defines the layers (tank, untouchable tank, shield, wall, mine, pickup, shot) and builds:

| Game object | Body |
| --- | --- |
| Tank | dynamic box, the tank's mass, friction 7/15 (14 m/s^2 of ground deceleration), restitution 0.15, its team's group |
| Missile, shell, rocket, bomblet, bomb | bullet in its owner's group (bombs have none) |
| Shield | static circle that follows its tank, solid only to enemy shots |
| Bulwark Wall | static segment in its owner's group |
| Mine | static sensor circle, touched by tanks and stopped at by shots |
| Pickup | static sensor circle, touched by tanks, including leaping ones |

`simulate.ts` turns the world's events into game rules: shot hits explode or reflect, falls are splashes, landings end a Thruster Leap with its shockwave, sensor overlaps trigger mines and award pickups. Blasts use `lineOfSight` and push with `applyImpulse(knockback * falloff)`, so the velocity change is `knockback * falloff / mass`. Jumps use `launch`. A Thruster Leap moves the tank to the untouchable layer until it lands.

`previewTrajectory` builds the same world from the planning state with only the previewed plan and no spread, and steps it with the same `stepRound` the resolution uses, so the guide is the real path step for step until the first contact. Bots search shots and jumps in their own small worlds (terrain, target boxes, pickup sensors) with the same integrator, `shotFate` rules, and launch.

## Using it in a new game

1. Build a `Terrain` once per map and share it.
2. Create a `World` per simulation from the persisted state; never keep a world between moves, so `reduce` stays pure.
3. Create bodies in a stable order (for example seat order) and keep the game's own objects next to them; put an index or tag in `data`.
4. Apply inputs with `launch` and `applyImpulse`, call `step()` a bounded number of times, and handle the events in order.
5. Persist rounded numbers, and add golden checksums for a scripted scenario that run under Bun and Node.

## Testing

```bash
bun test packages/physics
bun run --cwd packages/physics verify
bun run --cwd packages/games-core verify
```

The unit tests cover the integrator (exact semi-implicit Euler values and energy loss of exactly `g^2 dt^2 / 2` per free-flight step), landing, ledge-edge stability for ten seconds, friction distance, walls, ceilings, portals for bodies and bullets, the kill line with followers, bullets against thin boxes, circles, and segments at up to 6000 m/s, hit normals, filtering, sensors, followers, impulse and mass scaling, launches, raycasts, line of sight, and repeatable seeded scenarios.

## Where to go next

- [./games-core-engine.md](./games-core-engine.md): the `reduce()` purity and determinism contract the Tank Arena engine follows
- [./games-client.md](./games-client.md): the Tank Arena board that replays rounds and draws the aim guide
- [../games/tank-arena.md](../games/tank-arena.md): the game's rules and numbers
