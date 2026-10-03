import { describe, expect, test } from "bun:test";
import { datan2, dcos, dsin } from "../src/games/tank-arena/math";
import { traceProjectile } from "../src/games/tank-arena/simulate";
import {
  aimVector,
  BLASTS,
  buildArena,
  CLUSTER_OFFSETS,
  type Frame,
  GRAVITY,
  MIN_FALLOFF,
  previewTrajectory,
  type SimEvent,
  STEP,
  simulateRound,
  TANKS,
  WATER_Y,
} from "../src/index";
import { input, plan, run, started, tank } from "./tank-arena-fixtures";

function eventsOf<T extends SimEvent["type"]>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { type: T }> => event.type === type,
  );
}

function damageTo(events: SimEvent[], role: string): number {
  return eventsOf(events, "damage")
    .filter((event) => event.role === role)
    .reduce((sum, event) => sum + event.amount, 0);
}

function falloff(distance: number, radius: number): number {
  return 1 - ((1 - MIN_FALLOFF) * distance) / radius;
}

function bomb(column: number, round = 1) {
  return { airstrike: { round, columns: [column] }, round };
}

describe("arena", () => {
  test("builds Frostline Foundry from repeating modules", () => {
    const arena = buildArena(3);
    expect(arena.width).toBe(96);
    expect(arena.waterY).toBe(-6);
    expect(arena.boxes).toHaveLength(21);
    expect(arena.boxes[7]).toEqual({ x0: 32, y0: -3, x1: 45, y1: 0 });
    expect(arena.spawnSlots.map((slot) => slot.x)).toEqual([
      7, 25, 39, 57, 71, 89,
    ]);
    expect(arena.pickupAnchors.filter((a) => a.airborne)).toHaveLength(9);
    expect(arena.mineAnchors).toHaveLength(15);
  });

  test("deterministic trig matches the platform within 1e-10", () => {
    for (let deg = -180; deg <= 180; deg += 7.5) {
      expect(
        Math.abs(dsin(deg) - Math.sin((deg * Math.PI) / 180)),
      ).toBeLessThan(1e-10);
      expect(
        Math.abs(dcos(deg) - Math.cos((deg * Math.PI) / 180)),
      ).toBeLessThan(1e-10);
      const v = aimVector(deg);
      const back = datan2(v.y, v.x);
      const diff = Math.abs(((back - deg + 540) % 360) - 180);
      expect(diff).toBeLessThan(1e-6);
    }
  });
});

describe("missiles", () => {
  test("fly a ballistic arc with constant horizontal speed", () => {
    const frames: Frame[] = [];
    simulateRound(
      input([tank("p1", "kestrel", 19)], { p1: plan("missile", 60, 0.5) }),
      (frame) => frames.push(frame),
    );
    const path = frames
      .map((frame) => frame.projectiles[0])
      .filter((p) => p !== undefined);
    expect(path.length).toBeGreaterThan(10);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) continue;
      expect(b.vx).toBe(a.vx);
      expect(b.vy).toBeCloseTo(a.vy - GRAVITY * STEP, 12);
      expect(b.x - a.x).toBeCloseTo(b.vx * STEP, 9);
    }
    const apex = Math.max(...path.map((p) => p.y));
    const start = path[0];
    if (!start) throw new Error("no projectile");
    expect(apex).toBeGreaterThan(start.y + 2);
  });

  test("a direct hit deals full damage with armor, falloff applies beyond", () => {
    const direct = run([tank("p1", "kestrel", 19), tank("p2", "bastion", 27)], {
      p1: plan("missile", 0, 1),
    });
    expect(damageTo(direct.events, "p2")).toBe(21);
    const kestrelHit = run(
      [tank("p1", "bastion", 19), tank("p2", "kestrel", 27)],
      { p1: plan("missile", 0, 1) },
    );
    expect(damageTo(kestrelHit.events, "p2")).toBe(25);
    for (const offset of [1.5, 2.05, 2.8, 3.5]) {
      const result = run([tank("p2", "kestrel", 20 + offset)], {}, bomb(20));
      const expected =
        offset - TANKS.kestrel.halfWidth > BLASTS.bomb.radius
          ? 0
          : Math.round(
              BLASTS.bomb.damage *
                falloff(offset - TANKS.kestrel.halfWidth, BLASTS.bomb.radius),
            );
      expect(damageTo(result.events, "p2")).toBe(expected);
    }
  });

  test("never tunnel through thin terrain or tanks at any speed", () => {
    for (const speed of [40, 600, 6000]) {
      const wall = traceProjectile(64, 20, 3, -speed, 0, []);
      expect(wall.kind).toBe("terrain");
      expect(wall.x).toBeCloseTo(3, 1);
      const target = traceProjectile(64, 20, 1.2, -speed, 0, [
        { x: 10, y: 0.9, hw: 1.05, hh: 0.9 },
      ]);
      expect(target.kind).toBe("target");
      expect(target.x).toBeCloseTo(11.05, 1);
    }
  });

  test("knockback pushes away from the blast, scaled by mass", () => {
    const light = run([tank("p2", "kestrel", 22.05)], {}, bomb(20));
    const heavy = run([tank("p2", "bastion", 22.4)], {}, bomb(20));
    const lightTank = light.tanks[0];
    const heavyTank = heavy.tanks[0];
    expect(lightTank && lightTank.x > 22.05).toBe(true);
    expect(heavyTank && heavyTank.x > 22.4).toBe(true);
    expect((lightTank?.x ?? 0) - 22.05).toBeGreaterThan(
      (heavyTank?.x ?? 0) - 22.4,
    );
  });
});

describe("jumps", () => {
  test("land on platforms and slide to rest", () => {
    const barricade = run([tank("p1", "kestrel", 27.5)], {
      p1: plan("jump", 75, 0.65),
    });
    expect(barricade.tanks[0]?.y).toBe(2.2 + TANKS.kestrel.halfHeight);
    expect(barricade.tanks[0]?.x).toBeGreaterThan(30 - TANKS.kestrel.halfWidth);
    expect(barricade.tanks[0]?.x).toBeLessThan(31 + TANKS.kestrel.halfWidth);
    const roof = run([tank("p1", "kestrel", 14)], {
      p1: plan("specialB", 100, 0.9),
    });
    expect(roof.tanks[0]?.y).toBe(8 + TANKS.kestrel.halfHeight);
    expect(eventsOf(roof.events, "land")).toHaveLength(1);
  });

  test("collect airborne pickups along the way", () => {
    const result = run(
      [tank("p1", "kestrel", 27.5)],
      { p1: plan("jump", 75, 0.65) },
      { pickups: [{ id: 3, kind: "repair", x: 29.6, y: 4 }] },
    );
    expect(eventsOf(result.events, "pickup")).toEqual([
      { type: "pickup", role: "p1", id: 3, kind: "repair" },
    ]);
    expect(result.pickups).toEqual([]);
  });
});

describe("shields", () => {
  test("detonate shots on the bubble, absorb damage, and halve knockback", () => {
    const plain = run([tank("p1", "kestrel", 19), tank("p2", "bastion", 27)], {
      p1: plan("missile", 0, 1),
      p2: plan("idle"),
    });
    const shielded = run(
      [tank("p1", "kestrel", 19), tank("p2", "bastion", 27)],
      { p1: plan("missile", 0, 1), p2: plan("shield") },
    );
    const blast = eventsOf(shielded.events, "explode")[0];
    expect(blast?.x).toBeCloseTo(27 - TANKS.bastion.halfWidth - 0.9, 1);
    expect(damageTo(shielded.events, "p2")).toBe(0);
    const absorbed = eventsOf(shielded.events, "absorb")[0];
    expect(absorbed?.amount).toBeGreaterThan(0);
    expect(absorbed?.amount).toBeLessThanOrEqual(TANKS.bastion.shieldCapacity);
    expect(shielded.tanks[1]?.hp).toBe(160);
    const pushedPlain = (plain.tanks[1]?.x ?? 0) - 27;
    const pushedShield = (shielded.tanks[1]?.x ?? 0) - 27;
    expect(pushedShield).toBeLessThan(pushedPlain);
  });

  test("absorb only up to capacity", () => {
    const result = run(
      [tank("p1", "kestrel", 20)],
      { p1: plan("shield") },
      { mines: [{ id: 1, x: 21.5, y: 0.25 }] },
    );
    expect(eventsOf(result.events, "absorb")[0]?.amount).toBe(25);
    expect(damageTo(result.events, "p1")).toBe(15);
  });
});

describe("Bulwark Wall", () => {
  test("reflects enemy shots back as the wall owner's", () => {
    const result = run([tank("p1", "kestrel", 19), tank("p2", "bastion", 27)], {
      p1: plan("missile", 0, 1),
      p2: plan("specialB", 180, 0.5),
    });
    const reflect = eventsOf(result.events, "reflect");
    expect(reflect).toHaveLength(1);
    expect(reflect[0]?.role).toBe("p2");
    expect(reflect[0]?.x).toBeCloseTo(27 - 2.5, 6);
    expect(damageTo(result.events, "p2")).toBe(0);
    const hits = eventsOf(result.events, "damage").filter(
      (event) => event.role === "p1",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((event) => event.source === "p2")).toBe(true);
  });

  test("lets allied shots pass", () => {
    const result = run(
      [tank("p1", "kestrel", 19), tank("p2", "bastion", 27)],
      { p1: plan("missile", 0, 1), p2: plan("specialB", 180, 0.5) },
      { teams: { p1: "A", p2: "A" } },
    );
    expect(eventsOf(result.events, "reflect")).toHaveLength(0);
    expect(damageTo(result.events, "p2")).toBe(0);
  });
});

describe("specials", () => {
  test("Starfall Cluster splits into five bomblets at the apex", () => {
    const frames: Frame[] = [];
    const result = simulateRound(
      input([tank("p1", "kestrel", 15, { y: 15.9 })], {
        p1: plan("specialA", 70, 0.6),
      }),
      (frame) => frames.push(frame),
    );
    const split = eventsOf(result.events, "split");
    expect(split).toHaveLength(1);
    const splitFrame = frames.findIndex((frame) =>
      frame.events.some((event) => event.type === "split"),
    );
    const before = frames[splitFrame - 1]?.projectiles[0];
    const bomblets = frames[splitFrame + 1]?.projectiles ?? [];
    expect(bomblets.map((p) => p.kind)).toEqual(Array(5).fill("bomblet"));
    expect(before?.vy).toBeGreaterThan(0);
    const offsets = bomblets.map((p) => p.vx - (before?.vx ?? 0));
    offsets.forEach((offset, i) => {
      expect(offset).toBeCloseTo(CLUSTER_OFFSETS[i] ?? Number.NaN, 9);
    });
    expect(eventsOf(result.events, "explode").length).toBe(5);
  });

  test("Siege Mortar fires three fanned shells", () => {
    const result = run([tank("p1", "bastion", 19)], {
      p1: plan("specialA", 60, 0.6),
    });
    const shells = eventsOf(result.events, "fire");
    expect(shells.map((p) => p.kind)).toEqual(["shell", "shell", "shell"]);
    const angles = shells.map((p) =>
      datan2(p.y - TANKS.bastion.halfHeight, p.x - 19),
    );
    expect((angles[1] ?? 0) - (angles[0] ?? 0)).toBeCloseTo(4, 3);
    expect((angles[2] ?? 0) - (angles[1] ?? 0)).toBeCloseTo(4, 3);
  });

  test("Thruster Leap is untouchable in flight", () => {
    const shot = { p2: plan("missile", 160, 1) };
    const leap = run([tank("p1", "kestrel", 19), tank("p2", "kestrel", 26)], {
      ...shot,
      p1: plan("specialB", 90, 0.6),
    });
    const hop = run([tank("p1", "kestrel", 19), tank("p2", "kestrel", 26)], {
      ...shot,
      p1: plan("jump", 90, 0.6 * 1.4),
    });
    expect(damageTo(hop.events, "p1")).toBeGreaterThan(0);
    expect(damageTo(leap.events, "p1")).toBe(0);
  });

  test("Thruster Leap lands with a shockwave that spares allies", () => {
    const result = run(
      [
        tank("p1", "kestrel", 19),
        tank("p2", "bastion", 22),
        tank("p3", "bastion", 16.5 + 1),
      ],
      { p1: plan("specialB", 90, 0.4) },
      { teams: { p1: "A", p2: "B", p3: "A" } },
    );
    const wave = eventsOf(result.events, "explode").find(
      (event) => event.cause === "shockwave",
    );
    expect(wave?.owner).toBe("p1");
    const landed = result.tanks[0];
    const distance = 22 - TANKS.bastion.halfWidth - (landed?.x ?? 0);
    const expected = Math.round(
      BLASTS.shockwave.damage *
        falloff(distance, BLASTS.shockwave.radius) *
        (1 - TANKS.bastion.armor),
    );
    expect(damageTo(result.events, "p2")).toBe(expected);
    expect(damageTo(result.events, "p3")).toBe(0);
    expect(damageTo(result.events, "p1")).toBe(0);
    expect(result.tanks[1]?.x).toBeGreaterThan(22);
  });
});

describe("portals", () => {
  test("wrap a tank across the left and right edges", () => {
    const left = run([tank("p1", "kestrel", 3, { y: 8.9 })], {
      p1: plan("jump", 120, 0.7),
    });
    const leftWrap = eventsOf(left.events, "wrap");
    expect(leftWrap).toHaveLength(1);
    expect(leftWrap[0]?.entity).toBe("tank");
    expect(leftWrap[0]?.fromX).toBeLessThan(0);
    expect(leftWrap[0]?.toX).toBeGreaterThan(63);
    expect(left.tanks[0]?.y).toBe(8.5 + TANKS.kestrel.halfHeight);
    expect(left.tanks[0]?.x).toBeGreaterThan(53);
    const right = run([tank("p1", "kestrel", 62.5, { y: 3.1 })], {
      p1: plan("jump", 60, 0.5),
    });
    const rightWrap = eventsOf(right.events, "wrap");
    expect(rightWrap[0]?.fromX).toBeGreaterThanOrEqual(64);
    expect(rightWrap[0]?.toX).toBeLessThan(1);
    expect(right.tanks[0]?.x).toBeLessThan(2);
    expect(right.tanks[0]?.fell).toBe(false);
  });

  test("wrap projectiles across both edges", () => {
    const right = run([tank("p1", "kestrel", 60)], {
      p1: plan("missile", 35, 0.8),
    });
    const rightWrap = eventsOf(right.events, "wrap");
    expect(rightWrap[0]?.entity).toBe("projectile");
    expect(rightWrap[0]?.fromX).toBeGreaterThanOrEqual(64);
    expect(eventsOf(right.events, "explode")[0]?.x).toBeLessThan(4);
    const left = run([tank("p1", "kestrel", 3, { y: 8.9 })], {
      p1: plan("missile", 150, 0.8),
    });
    const leftWrap = eventsOf(left.events, "wrap");
    expect(leftWrap[0]?.entity).toBe("projectile");
    expect(leftWrap[0]?.fromX).toBeLessThan(0);
    expect(leftWrap[0]?.toX).toBeGreaterThan(60);
  });

  test("collisions see the wrapped image of a tank on the seam", () => {
    const result = run([tank("p2", "kestrel", 0.5)], {}, bomb(63.9));
    const blast = eventsOf(result.events, "explode")[0];
    expect(blast?.y).toBeGreaterThan(1.7);
    expect(damageTo(result.events, "p2")).toBe(28);
  });
});

describe("hazards", () => {
  test("falling into the pit removes the tank", () => {
    const result = run([tank("p1", "kestrel", 13.5)], {
      p1: plan("jump", 60, 0.4),
    });
    expect(result.tanks[0]?.fell).toBe(true);
    expect(result.tanks[0]?.y).toBeLessThan(WATER_Y);
    expect(eventsOf(result.events, "splash")).toHaveLength(1);
  });

  test("cover blocks blast damage through line of sight", () => {
    const covered = run([tank("p2", "kestrel", 32.2)], {}, bomb(29.7));
    const open = run([tank("p2", "kestrel", 27.2)], {}, bomb(29.7));
    expect(damageTo(covered.events, "p2")).toBe(0);
    expect(covered.tanks[0]?.x).toBe(32.2);
    expect(damageTo(open.events, "p2")).toBe(
      Math.round(BLASTS.bomb.damage * falloff(1.45, BLASTS.bomb.radius)),
    );
  });

  test("mines deal exactly 40 to the toucher before armor and plating", () => {
    const mine = { id: 7, x: 21.5, y: 0.25 };
    const light = run([tank("p1", "kestrel", 20)], {}, { mines: [mine] });
    expect(damageTo(light.events, "p1")).toBe(40);
    expect(eventsOf(light.events, "mine")).toEqual([
      { type: "mine", id: 7, x: 21.5, y: 0.25 },
    ]);
    expect(light.mines).toEqual([]);
    const heavy = run([tank("p1", "bastion", 19.8)], {}, { mines: [mine] });
    expect(damageTo(heavy.events, "p1")).toBe(34);
    const plated = run(
      [
        tank("p1", "bastion", 19.8, {
          effects: { overcharge: false, platingRounds: 1 },
        }),
      ],
      {},
      { mines: [mine] },
    );
    expect(damageTo(plated.events, "p1")).toBe(17);
  });

  test("mine splash reaches nearby tanks, explosions chain into mines", () => {
    const result = run(
      [tank("p1", "kestrel", 20), tank("p2", "kestrel", 24)],
      {},
      { mines: [{ id: 7, x: 21.5, y: 0.25 }] },
    );
    const distance = 24 - TANKS.kestrel.halfWidth - 21.5;
    expect(damageTo(result.events, "p2")).toBe(
      Math.round(40 * falloff(distance, BLASTS.mine.radius)),
    );
    const chained = run(
      [],
      {},
      {
        ...bomb(20),
        mines: [{ id: 9, x: 21, y: 0.25 }],
      },
    );
    expect(eventsOf(chained.events, "mine")).toHaveLength(1);
  });
});

describe("pickups", () => {
  const pickup = { id: 4, kind: "repair" as const, x: 20, y: 1 };

  test("the earliest toucher wins", () => {
    const late = tank("p1", "kestrel", 22.6, { vx: -5, hp: 50 });
    const early = tank("p2", "kestrel", 17.9, { vx: 3, hp: 50 });
    const alone = run([late], {}, { pickups: [pickup] });
    expect(eventsOf(alone.events, "pickup")[0]?.role).toBe("p1");
    const result = run([late, early], {}, { pickups: [pickup] });
    expect(eventsOf(result.events, "pickup")).toEqual([
      { type: "pickup", role: "p2", id: 4, kind: "repair" },
    ]);
    expect(result.tanks[1]?.hp).toBe(90);
    expect(result.tanks[0]?.hp).toBe(50);
  });

  test("same-step ties go to the closer center, then the lower seat", () => {
    const closer = run(
      [tank("p1", "kestrel", 18.6), tank("p2", "kestrel", 21)],
      {},
      { pickups: [pickup] },
    );
    expect(eventsOf(closer.events, "pickup")[0]?.role).toBe("p2");
    const even = run(
      [tank("p1", "kestrel", 18.8), tank("p2", "kestrel", 21.2)],
      {},
      { pickups: [pickup] },
    );
    expect(eventsOf(even.events, "pickup")[0]?.role).toBe("p1");
    const swapped = run(
      [tank("p2", "kestrel", 21.2), tank("p1", "kestrel", 18.8)],
      {},
      { pickups: [pickup] },
    );
    expect(eventsOf(swapped.events, "pickup")[0]?.role).toBe("p2");
  });

  test("overcharge multiplies the next damaging shot and is consumed", () => {
    const result = run(
      [
        tank("p1", "kestrel", 19, {
          effects: { overcharge: true, platingRounds: 0 },
        }),
        tank("p2", "kestrel", 27),
      ],
      { p1: plan("missile", 0, 1) },
    );
    expect(damageTo(result.events, "p2")).toBe(37);
    expect(result.tanks[0]?.effects.overcharge).toBe(false);
  });
});

describe("airstrikes and self-destruct", () => {
  test("bombs fall after everything else settles", () => {
    const frames: Frame[] = [];
    const result = simulateRound(
      input(
        [tank("p1", "kestrel", 19), tank("p2", "kestrel", 50)],
        { p1: plan("missile", 45, 0.8), p2: plan("idle") },
        { airstrike: { round: 3, columns: [10, 40] }, round: 3 },
      ),
      (frame) => frames.push(frame),
    );
    const strikeFrame = frames.findIndex(
      (frame) => frame.phase === "airstrike",
    );
    expect(strikeFrame).toBeGreaterThan(0);
    expect(
      frames.slice(0, strikeFrame).every((frame) => frame.phase === "action"),
    ).toBe(true);
    expect(
      frames[strikeFrame]?.events.filter((e) => e.type === "airstrike"),
    ).toHaveLength(2);
    expect(frames[strikeFrame - 1]?.projectiles).toEqual([]);
    expect(result.steps).toBe(frames.length);
    const notYet = run(
      [tank("p1", "kestrel", 19)],
      {},
      { airstrike: { round: 4, columns: [19] }, round: 3 },
    );
    expect(eventsOf(notYet.events, "airstrike")).toHaveLength(0);
  });

  test("destroyed tanks self-destruct once, hurting enemies but not allies", () => {
    const wreck = (allyTeam: string) =>
      run(
        [
          tank("p1", "kestrel", 21),
          tank("p2", "kestrel", 24, { hp: 0 }),
          tank("p4", "kestrel", 27),
        ],
        {},
        { teams: { p1: "A", p2: "B", p4: allyTeam } },
      );
    const result = wreck("B");
    expect(eventsOf(result.events, "selfDestruct")).toEqual([
      { type: "selfDestruct", role: "p2" },
    ]);
    const blast = eventsOf(result.events, "explode");
    expect(blast).toHaveLength(1);
    expect(blast[0]?.cause).toBe("selfDestruct");
    expect(blast[0]?.owner).toBe("p2");
    const expected = Math.round(
      BLASTS.selfDestruct.damage *
        falloff(24 - 21 - TANKS.kestrel.halfWidth, BLASTS.selfDestruct.radius),
    );
    expect(eventsOf(result.events, "damage")).toEqual([
      { type: "damage", role: "p1", amount: expected, source: "p2" },
    ]);
    expect(result.tanks[1]?.selfDestructed).toBe(true);
    expect(damageTo(wreck("C").events, "p4")).toBe(expected);
    const phases = new Set<string>();
    simulateRound(
      input([tank("p1", "kestrel", 19), tank("p2", "kestrel", 27, { hp: 5 })], {
        p1: plan("missile", 0, 1),
      }),
      (frame) => phases.add(frame.phase),
    );
    expect([...phases]).toEqual(["action", "selfDestruct"]);
  });

  test("forfeiting and fallen tanks do not self-destruct", () => {
    const forfeit = run(
      [tank("p1", "kestrel", 19), tank("p2", "kestrel", 27, { hp: 5 })],
      { p1: plan("missile", 0, 1), p2: plan("forfeit") },
    );
    expect(eventsOf(forfeit.events, "selfDestruct")).toHaveLength(0);
    expect(forfeit.tanks[1]?.forfeited).toBe(true);
    const fallen = run([tank("p1", "kestrel", 13.5, { hp: 0.5 })], {
      p1: plan("jump", 60, 0.4),
    });
    expect(eventsOf(fallen.events, "selfDestruct")).toHaveLength(0);
  });
});

describe("aim guide", () => {
  const state = {
    ...started(["kestrel", "bastion"]),
    tanks: [tank("p1", "kestrel", 27.5), tank("p2", "bastion", 50)],
  };

  test("shot previews follow the projectile and scale with accuracy", () => {
    const light = previewTrajectory(state, "p1", "missile", 60, 0.5);
    const heavy = previewTrajectory(state, "p2", "specialA", 60, 0.5);
    expect(light.visibleFraction).toBe(TANKS.kestrel.guideFraction);
    expect(heavy.visibleFraction).toBe(TANKS.bastion.guideFraction);
    expect(light.points.length).toBeGreaterThan(10);
    const start = light.points[0];
    const direction = aimVector(60);
    expect(start?.x).toBeCloseTo(27.5 + direction.x * 1.583, 2);
    const frames: Frame[] = [];
    simulateRound(
      input(
        [tank("p1", "kestrel", 27.5)],
        { p1: plan("missile", 60, 0.5) },
        {
          seed: 3,
        },
      ),
      (frame) => frames.push(frame),
    );
    const flown = frames.map((frame) => frame.projectiles[0]).filter(Boolean);
    expect(flown.length).toBeGreaterThan(5);
  });

  test("jump previews end where the tank comes to rest", () => {
    const preview = previewTrajectory(state, "p1", "jump", 75, 0.65);
    const end = preview.points[preview.points.length - 1];
    const actual = run([tank("p1", "kestrel", 27.5)], {
      p1: plan("jump", 75, 0.65),
    }).tanks[0];
    expect(end?.x).toBe(actual?.x);
    expect(end?.y).toBe(actual?.y);
    expect(preview.visibleFraction).toBe(1);
    const leap = previewTrajectory(state, "p1", "specialB", 75, 0.65);
    expect(leap.points.length).toBeGreaterThan(preview.points.length);
  });

  test("walls preview their segment and passive actions have no guide", () => {
    const wall = previewTrajectory(state, "p2", "specialB", 0, 0.5);
    expect(wall.points).toHaveLength(2);
    expect(wall.points).toEqual([
      { x: 52.5, y: 1.2 - 1.6 },
      { x: 52.5, y: 1.2 + 1.6 },
    ]);
    expect(previewTrajectory(state, "p1", "shield", 90, 0.5).points).toEqual(
      [],
    );
    expect(previewTrajectory(state, "p9", "missile", 90, 0.5)).toEqual({
      points: [],
      visibleFraction: 0,
    });
  });
});
