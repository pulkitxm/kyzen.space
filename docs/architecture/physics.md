# physics: Deterministic 2D Physics

## What this is

`@kyzen/physics` is a deterministic 2D physics package designed for cross-runtime reproducibility. The same simulation inputs produce bit-identical outputs across Bun, Node, Deno, and browser environments. Tank Arena uses it for tank movement, projectile trajectories, and collision detection.

The package provides:

- Polynomial trigonometry (`dsin`, `dcos`, `datan2`) that avoids platform-dependent `Math.sin`/`Math.cos`
- ChaCha20-based secret derivation for cryptographically-seeded randomness
- Mulberry32 PRNG for fast deterministic random sequences
- Semi-implicit Euler integration with fixed timestep
- Swept collision detection (CCD) to prevent tunneling
- Module-based spatial partitioning for terrain
- Sleep detection for resting bodies
- Horizontal world wrapping for portal-style arenas

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/physics/src/math.ts` | Deterministic math: polynomial trig, angle normalization, rounding, clamping, PRNG, ChaCha20 |
| `packages/physics/src/types.ts` | Core types: `Vec2`, `AABB`, `Body`, `BodyDef`, `Shape`, `WorldConfig`, `PhysicsEvent` |
| `packages/physics/src/geometry.ts` | Geometry utilities: AABB construction, overlap tests, swept collision, raycast helpers |
| `packages/physics/src/body.ts` | Body management: creation, impulses, forces, velocity/position setters |
| `packages/physics/src/world.ts` | The `World` class: body/terrain management, stepping, queries |
| `packages/physics/src/index.ts` | Public barrel exports |
| `packages/physics/tests/*.test.ts` | Unit tests for each module |
| `packages/physics/scripts/verify-determinism.ts` | Cross-runtime golden hash verification |

## Determinism contract

The physics package uses only these operations:

- Arithmetic: `+ - * /`
- Safe Math functions: `Math.sqrt`, `Math.floor`, `Math.round`, `Math.abs`, `Math.min`, `Math.max`, `Math.imul`
- No `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.pow`, `Math.exp`, `Math.log`, `Math.random`
- No `Date.now()`, `performance.now()`, or `crypto.getRandomValues()`

The polynomial trig functions approximate sine and cosine to within 1e-6 for the angles games use. The implementations fold angles into the [-45, 45] degree range where the polynomial converges fastest, then use identities to extend coverage.

The `verify-determinism.ts` script computes golden hashes under both Bun and Node. Both runtimes produce identical output, proving cross-engine determinism.

## World configuration

```ts
const world = new World({
  gravity: 30,
  dt: 1 / 60,
  width: 200,
  wrapX: true,
  friction: 300,
  restitution: 0.3,
  restSpeed: 0.05,
  restFrames: 10,
  waterY: -10,
  bucketSize: 32,
});
```

| Option | Description |
| --- | --- |
| `gravity` | Downward acceleration (units/s^2) |
| `dt` | Fixed timestep (seconds), default 1/60 |
| `width` | World width for wrap calculations |
| `wrapX` | Enable horizontal wrapping |
| `friction` | Ground friction deceleration |
| `restitution` | Bounce coefficient [0, 1] |
| `restSpeed` | Speed threshold for sleep detection |
| `restFrames` | Frames at rest before sleeping |
| `waterY` | Y coordinate below which bodies fall out |
| `bucketSize` | Spatial partition size for terrain |

## Body types and shapes

Bodies are `static` or `dynamic`. Static bodies do not move or respond to forces.

```ts
const tank = world.addBody({
  id: "tank-1",
  type: "dynamic",
  shape: { type: "box", halfWidth: 1.5, halfHeight: 2 },
  x: 10,
  y: 50,
  vx: 5,
  vy: 0,
  mass: 1,
  restitution: 0.3,
  gravityScale: 1,
});
```

Shapes:

- `box`: axis-aligned bounding box with `halfWidth` and `halfHeight`
- `circle`: circle with `radius`
- `segment`: line segment with `x0, y0, x1, y1` (static only)

## Integration and collision

`world.step()` advances the simulation by one timestep:

1. Apply gravity to dynamic bodies
2. Apply ground friction to supported bodies
3. Move bodies along X axis, resolving terrain collisions
4. Move bodies along Y axis, resolving terrain collisions
5. Wrap X position if `wrapX` is enabled
6. Update support/rest state
7. Emit physics events (land, sleep, wake)

The integrator uses semi-implicit Euler: velocity is updated first, then position uses the new velocity. This is more stable than explicit Euler.

Terrain collision uses swept tests to prevent tunneling. The body's path is tested against all terrain boxes in the relevant spatial buckets. On collision, the body is placed at the contact point and its velocity component is reversed with restitution.

## Spatial queries

```ts
const t = world.sweepTerrain(x, y, dx, dy);

const result = world.raycast(x, y, dirX, dirY, maxDist);
if (result.hit) {
  console.log(result.body?.id, result.t);
}

const nearby = world.queryCircle(x, y, radius);

const inArea = world.queryAABB(minX, minY, maxX, maxY);
```

## Static terrain

```ts
world.setStaticBoxes([
  { x: 50, y: 0, hw: 100, hh: 2 },
  { x: 150, y: 10, hw: 20, hh: 2 },
]);
```

Static boxes are partitioned into spatial buckets for fast lookup. The bucket size defaults to 32 units (one Tank Arena module width).

## Events

`world.step()` returns an array of physics events:

- `{ type: "land", bodyA: Body }`: body just landed on terrain
- `{ type: "sleep", bodyA: Body }`: body entered sleep state
- `{ type: "wake", bodyA: Body }`: body woke from sleep

## Tank Arena migration

Tank Arena's simulation (`packages/games-core/src/games/tank-arena/simulate.ts`) uses `@kyzen/physics` for:

- Math functions: `dsin`, `dcos`, `datan2`, `wrapX`, `wrapDelta`, `deriveRng`, `deriveSecret`, `secretWord`, `secretRng`
- Geometry functions: `boxDistance`, `boxTouchesCircle`, `sweepPointVsBox`, `sweepPointVsSegment`, `sweepCircleVsCircle`

The game-specific simulation logic (projectiles, explosions, pickups, walls) remains in `simulate.ts`. The physics package provides the deterministic primitives; the game builds on them.

## Testing

```bash
bun test packages/physics/
bun run --cwd packages/physics verify
npx tsx packages/physics/scripts/verify-determinism.ts
```

The golden hash tests verify that polynomial trig, PRNG, ChaCha20, secret derivation, and world simulation produce identical results across runs and runtimes.

## Gotchas

- **Never use `Math.random()` or `Date.now()` in simulation code.** Use `deriveRng` with a seed stored in game state.
- **Never use `Math.sin`, `Math.cos`, `Math.atan2`, etc.** Use `dsin`, `dcos`, `datan2`.
- **Normalize -0 to 0** when comparing or hashing values. Use `value + 0` or check `Object.is(value, -0)`.
- **Fixed timestep only.** Variable timesteps break determinism.

## Where to go next

- [./games-core-engine.md](./games-core-engine.md): the `reduce()` purity/determinism contract that Tank Arena's engine follows
- [./games-client.md](./games-client.md): the Tank Arena board that renders physics state
- [docs/games/tank-arena.md](../games/tank-arena.md): game rules and mechanics
