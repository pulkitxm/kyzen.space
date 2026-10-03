# Tank Arena

**Type slug:** `tank-arena`
**Category:** `party`

> Lock your shot in secret, then watch every tank fire at once across a frozen foundry.

## How to play

Every player drives one tank on a side-on industrial map. Each round, every
living tank secretly locks exactly one plan (fire, jump, shield, or a special)
with an aim angle and power. When the last plan is locked, all plans resolve at
the same moment in one deterministic simulation that every client replays. The
last team with a tank standing wins.

A seven-step player-facing summary lives in `meta.howToPlay`
(`packages/games-core/src/games/tank-arena/meta.ts`) and renders in the game
page's "How to play" card. Units below are meters, seconds, and degrees.

## Players, roles, and teams

- **Player count:** at least 2 (`minPlayers` 2). The engine sets no upper bound
  (`maxPlayers` is infinite) and the state schema has no seat cap. Private
  lobbies leave humans uncapped and allow at most 64 bots (`LOBBY_MAX_BOTS`);
  see [Practical limits](#practical-limits).
- **Roles:** `p1`, `p2`, ... `pN`, from `roleForSeat(index)` = `p<index + 1>`.
- **Mode:** `simultaneous`. Every living seat submits once per round; there is
  no turn order.
- **Teams:** every seat has a `team`. In free-for-all the team is the seat's own
  role. In teams mode it is a capital letter (`A`, `B`, ...). Allies never
  damage each other.
- **Bots:** a seat may carry a bot difficulty (`easy`, `normal`, `hard`). Bots
  exist only in private rooms.

## Tanks

There are exactly two tanks, both free. Constants live in `TANKS`
(`packages/games-core/src/games/tank-arena/constants.ts`).

| | Bastion (heavy) | Kestrel (light) |
| --- | --- | --- |
| Max HP | 160 | 120 |
| Mass (knockback divisor) | 1.8 | 0.75 |
| Collider (half width x half height) | 1.4 x 1.2 | 1.05 x 0.9 |
| Max jump speed | 15 m/s | 23 m/s |
| Max shot speed | 32 m/s | 34 m/s |
| Accuracy | 55: spread +-3.0 deg, aim guide shows 40% of the arc | 85: spread +-0.8 deg, guide shows 85% of the arc |
| Armor | takes 15% less damage | none |
| Shield capacity | 45 | 25 |
| Shield bubble radius | 2.3 m | 1.95 m |
| Special A | Siege Mortar, cooldown 3 | Starfall Cluster, cooldown 3 |
| Special B | Bulwark Wall, cooldown 4 | Thruster Leap, cooldown 2 |

- **Siege Mortar:** three shells fanned at -4, 0, and +4 degrees around the aim
  (one shared accuracy roll), 18 damage each, blast radius 2.4.
- **Starfall Cluster:** a rocket that splits at its apex (when its vertical
  velocity reaches zero) into 5 bomblets. Each bomblet adds -6, -3, 0, +3, or
  +6 m/s to the rocket's horizontal velocity. 14 damage each, radius 2.0.
- **Bulwark Wall:** plants a 3.2 m barrier centered 2.5 m from the hull along
  the aim, perpendicular to it, for the whole resolution. Enemy projectiles that
  hit it (including airstrike bombs) reflect: velocity is mirrored about the wall
  normal and keeps 90% of its speed, and the projectile now belongs to Bastion's
  team. Allied projectiles pass through.
- **Thruster Leap:** a jump at up to 1.4x Kestrel's max jump speed (32.2 m/s).
  Kestrel is untouchable while airborne during the leap. On its first landing a
  shockwave hits enemies within 3.5 m for 22 damage with knockback 18.

**Cooldowns:** a cooldown of N means the special cannot be chosen in the next N
rounds; using it in round r makes it available again in round r + N + 1. The
remaining count is stored per tank and ticks down at the end of each round.
Coolant clears both cooldowns.

## Actions

Each lock picks one action. `angle` and `power` are always sent; actions that
do not aim ignore them.

- **Missile:** launch speed `power * maxShotSpeed` along the aimed angle after
  the accuracy spread. Ballistic under gravity 30 m/s^2. Explodes on contact
  with terrain, an enemy tank, an enemy shield bubble, or a mine, or after 6 s.
  25 damage, radius 3.0.
- **Jump:** velocity `power * maxJumpSpeed` along the aimed angle, which must
  point upward (10 to 170 degrees). Collects pickups it passes through,
  including airborne ones.
- **Shield:** a bubble of radius `halfWidth + 0.9` for the whole resolution.
  Enemy projectiles detonate on its surface. It absorbs incoming damage up to the
  tank's shield capacity and halves knockback. Leftover capacity is lost at the
  end of the round.
- **Special A / Special B:** the tank's specials above. Thruster Leap follows
  the jump angle rule.
- **Idle:** do nothing. Timeouts lock this.
- **Forfeit:** the tank powers down and is eliminated at the end of the round
  without a self-destruct blast. Players can forfeit at any time ("Leave
  match"), and the engine forfeits a seat automatically on its third
  consecutive timeout.

Projectiles pass through allied tanks, allied shields, and allied walls, and
are removed when they fall below the water line.

## Aiming

- `angle` is in degrees from -180 to 180: 0 points right (+x), 90 points up.
- `power` is from 0.15 to 1.
- The accuracy spread is a uniform offset in +-spread degrees, rolled at
  resolution from the round's seeded generator, so a locked plan never reveals
  the exact shot in advance.
- The aim guide draws only part of the predicted arc: 40% for Bastion and 85%
  for Kestrel.
- Directions use deterministic polynomial sine and cosine (only `+ - * /`), never
  `Math.sin` or `Math.cos`, so every runtime computes the same trajectory.

## Damage

- **Falloff:** full damage at the blast center, falling linearly to 40% at the
  blast radius, measured from the blast center to the nearest point of the
  tank's collider.
- **Line of sight:** blast damage and knockback need a clear line from the blast
  center to the tank's center. Terrain blocks it; shields do not.
- **Multipliers:** Overcharge 1.5x (on the attacker's next damaging shot),
  Bastion armor 0.85x, own blasts 0.5x, Plating 0.5x. They stack
  multiplicatively and the result is rounded to a whole number.
- **Shields** absorb damage before HP.
- **Knockback:** velocity `knockback * falloff / mass` away from the blast
  center, halved while shielded.
- HP can drop below zero during a resolution; it is clamped to 0 afterwards.

| Source | Damage | Radius | Knockback |
| --- | --- | --- | --- |
| Missile | 25 | 3.0 | 10 |
| Siege Mortar shell (x3) | 18 | 2.4 | 10 |
| Starfall rocket or bomblet (x5) | 14 | 2.0 | 10 |
| Thruster Leap shockwave (enemies only) | 22 | 3.5 | 18 |
| Mine | 40 | 2.5 | 12 |
| Airstrike bomb | 28 | 2.6 | 10 |
| Self-destruct | 20 | 3.2 | 10 |

## Rounds and timers

1. **Round 0, tank select (20 s).** Every living seat sends `select`. Picks stay
   hidden until everyone has picked. A timeout picks by seat index: even indexes
   (`p1`, `p3`, ...) get Bastion, odd indexes get Kestrel.
2. **Round 1 planning (25 s, including the battle-start banner).** Every
   living tank locks one plan, hidden until resolution.
3. **Later rounds (22 s plus the previous replay).** The replay allowance is
   `round(steps * 1000 / 60) + 1500` ms for the previous resolution.
4. **Resolution.** When the last living role locks (or the platform auto-locks
   absentees on timeout), `reduce` simulates the round at a fixed step of
   1/60 s, in three phases:
   - Phase A: every plan starts at step 0. Runs until no projectile remains and
     every tank has been supported with speed below 0.05 for 20 steps, at most
     540 steps.
   - Phase B: airstrike bombs fall, if a strike is due, at most 240 steps.
   - Phase C: self-destruct blasts and their knockback settle, at most 120
     steps.
   The state stores the pre-resolution snapshot and the revealed plans so every
   client re-runs `simulateRound` for an identical replay, then snaps to the
   authoritative state.
5. **End of round:** eliminations (destroyed, fell, forfeit), cooldown and
   Plating countdowns, pickup and mine spawns, the next airstrike announcement,
   and the outcome check. Persisted numbers are rounded to 4 decimals.

**Timeouts:** for every pending human role the platform submits `autoMove`: an
idle lock (or the default tank in round 0), all in one batch. A real submission
resets the strike count; the third consecutive timeout submits `forfeit`
instead.

**Result delay:** `resultDelayMs(state)` is the time the client needs to present
the final state before results: `round(steps * 1000 / 60) + 1500` ms for the
final resolution (the replay plus the results banner), or 0 when there is no
final resolution (a game decided during tank select). For an unfinished state
it returns the same measure for the latest resolution.

**Bot-only rounds:** while any human is pending, bots lock the moment a round
opens. Once no human is pending (every human is eliminated or forfeited), the
platform waits `resultDelayMs` after each resolution before the bots lock, so
spectators and eliminated players watch every round at the normal replay pace
instead of the match resolving at once. The round's `turnDeadline` shows when
that happens.

## Map: Frostline Foundry

The map repeats a 32 m module. `modules = max(2, ceil(players / 2))` and the
width is `W = 32 * modules` (64 m for 1v1 and 2v2).

- **Portals:** the left and right edges are green portals. Tanks, projectiles,
  bomblets, and jumps crossing `x = 0` or `x = W` wrap to the other side, and
  collision checks see across the seam.
- **No ceiling:** anything that flies up falls back down.
- **Water:** the water line is `y = -6`. A tank whose center falls below it is
  eliminated (it fell), and projectiles below it are removed.
- **Pit:** each module's floor has a 4 m gap between `x = 13` and `x = 17`
  that drops to the water.

Terrain is indestructible axis-aligned boxes per module (x relative to the
module start):

| Piece | x | y |
| --- | --- | --- |
| Floor left | 0 to 13 | -3 to 0 |
| Floor right | 17 to 32 | -3 to 0 |
| Bunker roof | 2 to 10.5 | 7 to 8 |
| Bunker back wall | 2 to 3 | 0 to 7 |
| Floating island over the pit | 11.5 to 18.5 | 13.5 to 15 |
| East ledge (open underneath) | 21 to 29.5 | 7.5 to 8.5 |
| Short barricade | 30 to 31 | 0 to 2.2 |

- **Spawns:** two slots per module, `x = 7` (inside the bunker) and `x = 25`
  (under the east ledge), resting on the floor. Seats are interleaved by team
  (each team's first member, then each team's second member, ...) and spread
  evenly over all slots, rotated by a seeded offset.
- **Pickup anchors:** (6.5, 9.6) on the bunker roof, (15, 17.5) above the
  island, (15, 4.5) over the pit, (25.2, 10) above the east ledge (these three
  need a jump), and (19.5, 1) on the floor.
- **Mine anchors:** on the floor at `x = 5, 11, 19.5` and on the east ledge at
  `x = 23, 27`.

## Pickups and mines

- **Pickups** (radius 0.8):
  - Repair: +40 HP, capped at max HP.
  - Overcharge: the next damaging shot deals 1.5x; consumed when fired, and it
    covers every shell or bomblet of that shot.
  - Plating: half damage taken for the rest of the round it is collected in and
    the next 2 rounds.
  - Coolant: clears both special cooldowns.
- **Pickup spawns:** after resolving an even round r >= 2, spawn
  `ceil(players / 4)` pickups, never exceeding `2 + floor(players / 2)` active
  pickups. Each takes a random free anchor (at least 3 m from every living tank
  and every other item) and a uniformly random kind.
- **Collection:** the first tank whose collider touches a pickup collects it.
  Same-step ties go to the smaller center distance, then the lower seat index.
  Tanks at 0 HP cannot collect.
- **Mine spawns:** after resolving round r >= 3 with `r % 3 == 0`, place
  `ceil(players / 4)` mines at random free mine anchors at least 4 m from every
  living tank and 3 m from other items. Mines stay until they detonate.
- **Mine detonation:** a tank whose collider touches a mine (radius 0.9) sets it
  off and takes exactly 40 damage before armor, Plating, and shields. Other
  tanks within 2.5 m, on any team, take the usual falloff splash (12
  knockback). Any explosion within 1.5 m of a mine also detonates it; that blast
  belongs to whoever caused the explosion, so their allies are spared.

## Airstrikes

- **Schedule:** strikes land in rounds 6, 9, and 12, then every round from
  round 15.
- **Warning:** each strike is announced when the previous round resolves:
  `state.airstrike` holds the round it lands in and its columns, so players see
  it while planning.
- **Columns:** `3 + modules` columns, doubled from round 25, evenly spaced
  `W / count` apart from a seeded offset.
- **Bombs:** they fall in Phase B, after all other motion settles, starting
  at `y = 34` with 8 m/s downward speed: 28 damage, radius 2.6, standard
  falloff and knockback. Bombs belong to no team, so they hurt everyone.

## Self-destruct

After the airstrike phase, every tank at 0 HP or below that did not forfeit and
did not fall explodes for 20 damage in a 3.2 m radius, hurting other teams
only. All doomed tanks are removed first, and the blasts are applied in seat
order from the same pre-blast state, so there is no chain: a tank brought to
0 HP by a self-destruct blast is eliminated without exploding.

## Outcomes

After each resolution (and after tank select), a team is alive if any of its
tanks is alive.

- **Win:** exactly one team is alive. `winnerRoles` lists every role on that
  team, including members eliminated earlier; `draw` is false.
- **Draw:** no team is alive. Every team that still had a living tank at the
  start of the round shares the draw (`winnerRoles` are their roles, `draw` is
  true); every other seat loses.
- **Round limit:** if round 40 resolves with several teams alive, the team with
  the highest total remaining HP wins. Equal totals draw among those teams.
- **Otherwise** the game continues.
- **Illegal moves (rejected, no state change):**
  - the game is finished,
  - the actor has no seat, or their tank is eliminated,
  - the move fails schema validation,
  - `select` after tank select ended, or `lock` during tank select,
  - the move's round is not the current round,
  - the role already submitted this round,
  - a special still cooling down, or
  - a jump or Thruster Leap angle outside 10 to 170 degrees.

Eliminated players spectate. `state.eliminated` records each role's round and
cause (`destroyed`, `fell`, or `forfeit`).

## Bots

`botMove(state, role, difficulty)` is pure and deterministic: it seeds its own
generator from the game seed, round, and role, and uses the same projectile
integrator as the simulation.

- **Easy:** picks Bastion or Kestrel at random. In 15% of rounds it jumps
  randomly. Otherwise it fires a missile at the nearest enemy along the analytic
  angle, with +-18 deg angle noise and +-35% power noise. It never shields or
  uses specials.
- **Normal:** shields when below 35% HP and an enemy has line of sight. When
  pickups exist, it jumps toward a reachable one 20% of the time. Otherwise it
  samples 32 (angle, power) candidates for the missile and for Special A when
  available, scores predicted damage against enemies' current positions, and
  adds +-5 deg noise to the best.
- **Hard:**
  - Samples 128 candidates per shot action and refines the best four with a
    local search, considering shots through the portals. Scoring penalizes
    self-damage and spares teammates.
  - Shields when below 40% HP and predicted incoming damage is at least half its
    HP.
  - Bastion raises the Bulwark Wall toward the most dangerous enemy when below
    60% HP.
  - Kestrel uses Thruster Leap when an enemy is within 2.5 m, so the landing
    shockwave hits it.
  - Either tank jumps clear of a nearby mine, and goes for pickups when no enemy
    has line of sight or no good shot exists (Kestrel leaps for ones a jump
    cannot reach).
  - Repositions with a jump when its best shot deals under 6 damage; otherwise
    fires with +-1 deg noise.
- **Tank choice:** easy picks at random. Normal and hard pick Bastion in a
  bunker spawn and Kestrel under the east ledge, alternating with teammates who
  share the same kind of spawn.

## State shape

```ts
{
  version: 1;
  seed: number;
  round: number;
  phase: "select" | "plan" | "finished";
  modules: number;
  seats: { role: string; team: string; bot: "easy" | "normal" | "hard" | null }[];
  tanks: {
    role: string;
    kind: "bastion" | "kestrel" | null;
    x: number; y: number; vx: number; vy: number;
    hp: number;
    alive: boolean; fell: boolean; forfeited: boolean;
    cooldowns: { specialA: number; specialB: number };
    effects: { overcharge: boolean; platingRounds: number };
  }[];
  pickups: { id: number; kind: "repair" | "overcharge" | "plating" | "coolant"; x: number; y: number }[];
  mines: { id: number; x: number; y: number }[];
  nextId: number;
  airstrike: { round: number; columns: number[] } | null;
  submitted: string[];
  plans: Record<string, { action: Action | "forfeit"; angle: number; power: number }>;
  resolution: {
    round: number;
    steps: number;
    before: { tanks; pickups; mines; airstrike };
    plans: Record<string, Plan>;
    damage: { role: string; amount: number }[];
    collected: { role: string; kind: PickupKind }[];
    eliminated: { role: string; cause: "destroyed" | "fell" | "forfeit" }[];
  } | null;
  eliminated: { role: string; round: number; cause: "destroyed" | "fell" | "forfeit" }[];
  outcome: { winnerRoles: string[]; draw: boolean } | null;
}
```

- `round` is 0 during tank select and counts up to 40.
- `submitted` lists the roles that already selected or locked this round.
- `plans` holds this round's hidden plans.
- `resolution` is the last resolved round: its pre-resolution snapshot, the
  revealed plans, and HUD events.
- The schema is strict, and every number is bounded.

The initial state has `round` 0, `phase` `"select"`, every tank alive with
`kind` null, and no pickups, mines, or airstrike.

## Move shape

```ts
| { type: "select"; round: 0; tank: "bastion" | "kestrel" }
| { type: "lock"; round: number; action: Action; angle: number; power: number }
| { type: "forfeit"; round: number }
```

- `Action` is `"missile" | "jump" | "shield" | "specialA" | "specialB" | "idle"`.
- `angle` is -180 to 180, `power` is 0.15 to 1, and `round` must equal the
  current round.
- Every variant is strict.

## Hidden information

- `publicState` removes the contents of `plans` and, during tank select, every
  tank's `kind`. Only `submitted` shows who has locked.
- `publicMove` replaces a `select` or `lock` move of the current, unresolved
  round with `{ type: "submitted", round }`. Once the round resolves, the full
  move is public for replay verification. `forfeit` moves are public
  immediately.

## Config, queues, and lobby

The config is the shared `lobbyConfigSchema`
(`packages/shared/src/types/games/lobby.ts`):
`{ mode: "ffa" | "teams", teams: Record<userId, TeamId>, bots: { id: "bot:<n>", difficulty, team }[] }`.
`playerCount(config)` is 4 for `teams` and 2 otherwise.

- **Public queues** (no bots): `1v1` sends `{ mode: "ffa" }` and seats two
  players, each on their own team. `2v2` sends `{ mode: "teams" }` and seats
  four players; seat order is shuffled and teams alternate `A`, `B` by seat
  index.
- **Private lobby** (`engine.lobby` = `{ teams: true, bots: true }`):
  - The host picks free-for-all or teams, assigns team letters, adds up to 64
    bots with a difficulty and team, and starts once at least 2 seats are
    filled. Team assignments may only name seated players and configured bots.
  - Seats are the humans in seat order, then bots in config order.
  - In teams mode an unassigned seat joins the less populated of `A` and `B`,
    and the seats must span at least two teams to configure or start.
  - Bot seats appear as `"Bot <n> (<Difficulty>)"`, where `n` is the bot's
    1-based position in `config.bots`, so bots of the same difficulty stay
    distinct.
  - Guests can leave the lobby (`room:leave`) and the host can remove a guest
    (`room:kick`); seats close up and the player's team entry is dropped.
  - Seated players can use the temporary match chat in the lobby to coordinate.
  - After a private room finishes, Rematch opens a new lobby with the same
    config, hosted by whoever asked first, and invites the other players.

## Practical limits

- **Humans are uncapped.** A private lobby accepts any number of humans.
- **Bots are capped at 64 per lobby** (`LOBBY_MAX_BOTS` in
  `packages/shared/src/types/games/lobby.ts`, enforced by `lobbyConfigSchema`).
  `room:configure` also rejects `teams` keys that are not seated players or
  configured bots, so a lobby config stays bounded by its real participants.
- **Bot batching.** While a human is pending, every pending bot locks at once:
  the moves are reduced in memory, saved in one transaction with consecutive
  move numbers under a single state compare-and-swap, and broadcast once.

Measured server cost with 1 human and N hard bots, before and after batching.
"Tank select" is `room:start` plus the human's tank pick, which ends selection
and lets every bot lock round 1. "Planning round" is the human's round 1 lock,
which resolves the round and lets every bot lock round 2. CPU and wall time are
for the server process against a local PostgreSQL 17 on one Apple Silicon
laptop (Bun 1.4.2). Broadcast KB is the total `game_state` payload sent to the
game room, which every viewer receives. Values are medians of three interleaved
before and after runs of seven samples each; the machine was shared, so treat
the timings as approximate. The broadcast counts and sizes are exact.

| Hard bots | Phase | CPU ms | Wall ms | Broadcasts | Broadcast KB |
| --- | --- | --- | --- | --- | --- |
| 8 | Tank select | 59 to 57 | 53 to 49 | 18 to 4 | 74.8 to 17.8 |
| 8 | Planning round | 21 to 20 | 21 to 18 | 9 to 2 | 61.1 to 13.7 |
| 32 | Tank select | 166 to 147 | 202 to 145 | 66 to 4 | 860.5 to 58.1 |
| 32 | Planning round | 89 to 54 | 116 to 51 | 33 to 2 | 747.8 to 45.7 |
| 64 | Tank select | 364 to 278 | 497 to 277 | 130 to 4 | 3233.5 to 111.9 |
| 64 | Planning round | 220 to 96 | 320 to 95 | 65 to 2 | 2848.6 to 88.3 |

What remains is mostly the bots' own aim search: a hard bot takes about 1 to
2.5 ms per move, so 64 hard bots spend roughly 90 to 160 ms of synchronous CPU
per round, and the public state is about 0.53 KB per tank.

The engine alone (`packages/games-core/tests/tank-arena-determinism.test.ts`,
three rounds per size, same machine) resolves a round of 128 tanks in about
3.5 ms on average (5.6 ms worst) with a 67.7 KB public state, and a round of 256
tanks in about 6 to 7.5 ms on average (10.6 to 15.6 ms worst) with a 135.6 KB
public state.

**Larger human counts** were not measured end to end. What is known: each
human lock is its own transaction and its own broadcast of the full public
state, so a round with H humans in an N-tank match sends about H broadcasts of
roughly 0.53 x N KB to every viewer. For 64 humans that is about 2.2 MB per
viewer per round, growing with the square of the room size. Round timeouts are
batched into one broadcast, and resolution itself stays in the low milliseconds
up to 256 tanks. Clocks are process-local, so one realtime node serves each
game.

## Board UI and audio

The board lives in `packages/games-client/src/games/tank-arena/` and uses the
`wide` layout. It renders the arena with Three.js, replays each resolution by
running the engine's `simulateRound` on the stored snapshot, and draws the HUD
in HTML over the canvas.

Background music (`/sounds/tank-arena-bg.ogg`) comes from `meta.backgroundMusic`.
The effects are in `/sounds/tank-arena/` (fire, explode, jump, land, shield,
wall, cluster, mine, pickup, portal, lock, tick, siren, splash, select). All of
it is original audio generated by `apps/web/scripts/gen-tank-audio.ts`; see
[audio.md](../architecture/audio.md#tank-arena-audio) for provenance and how to
regenerate it.

## Source

- Engine, simulation, bots, map, and meta: `packages/games-core/src/games/tank-arena/`
- Schemas and types (`tankArenaStateSchema`, `tankArenaMoveSchema`, `tankArenaConfigSchema`): `packages/shared/src/types/games/tank-arena/schemas.ts`
- Lobby config: `packages/shared/src/types/games/lobby.ts`
- Board and skeleton: `packages/games-client/src/games/tank-arena/`
- Audio generator: `apps/web/scripts/gen-tank-audio.ts`
