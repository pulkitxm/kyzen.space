import { describe, expect, test } from "bun:test";
import { deriveRng } from "../src/math";
import { Terrain } from "../src/terrain";
import type { Aabb, Body, PhysicsEvent } from "../src/types";
import { World } from "../src/world";

const G = 30;
const DT = 1 / 60;
const FLOOR: Aabb = { minX: 0, minY: -2, maxX: 40, maxY: 0 };
const LEDGE: Aabb = { minX: 50, minY: 6, maxX: 58, maxY: 7 };
const WALL: Aabb = { minX: 30, minY: 0, maxX: 31, maxY: 10 };

function world(
  boxes: readonly Aabb[] = [FLOOR],
  options: { wrap?: boolean; width?: number; killY?: number } = {},
) {
  return new World<string>({
    terrain: new Terrain({
      boxes,
      width: options.width ?? 64,
      wrap: options.wrap ?? true,
    }),
    gravity: G,
    dt: DT,
    killY: options.killY ?? -20,
  });
}

function tank(
  sim: World<string>,
  x: number,
  y: number,
  extra: { mass?: number; vx?: number; vy?: number; friction?: number } = {},
) {
  return sim.createBody({
    kind: "dynamic",
    shape: { type: "box", halfWidth: 1, halfHeight: 0.5 },
    x,
    y,
    mass: extra.mass ?? 1,
    vx: extra.vx,
    vy: extra.vy,
    friction: extra.friction ?? 0.5,
    restitution: 0.25,
    data: "tank",
  });
}

function run(sim: World<string>, steps: number) {
  const events: PhysicsEvent<string>[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step());
  return events;
}

function ofType<K extends PhysicsEvent<string>["type"]>(
  events: PhysicsEvent<string>[],
  type: K,
) {
  return events.filter(
    (event): event is Extract<PhysicsEvent<string>, { type: K }> =>
      event.type === type,
  );
}

describe("integration", () => {
  test("semi-implicit Euler: velocity first, then position", () => {
    const sim = world([]);
    const body = tank(sim, 10, 50, { vx: 3, vy: 6 });
    sim.step();
    expect(body.vy).toBe(6 - G * DT);
    expect(body.y).toBe(50 + (6 - G * DT) * DT);
    expect(body.x).toBe(10 + 3 * DT);
    let x = body.x;
    for (let i = 0; i < 30; i++) {
      sim.step();
      x += 3 * DT;
      expect(body.vx).toBe(3);
    }
    expect(body.x).toBe(x);
  });

  test("free flight loses exactly g^2 dt^2 / 2 of energy per step", () => {
    const sim = world([]);
    const body = tank(sim, 10, 0, { vx: 4, vy: 20 });
    const energy = () =>
      (body.vx * body.vx + body.vy * body.vy) / 2 + G * body.y;
    const start = energy();
    for (let i = 1; i <= 80; i++) {
      sim.step();
      expect(energy()).toBeCloseTo(start - (i * G * G * DT * DT) / 2, 9);
    }
  });

  test("bodies without gravity scale float", () => {
    const sim = world([]);
    const body = sim.createBody({
      kind: "bullet",
      x: 5,
      y: 5,
      vx: 1,
      vy: 0,
      gravityScale: 0,
      data: "probe",
    });
    run(sim, 10);
    expect(body.y).toBe(5);
  });
});

describe("terrain contacts", () => {
  test("a falling body lands once, rests on top, and sleeps", () => {
    const sim = world();
    const body = tank(sim, 10, 5);
    const events = run(sim, 120);
    expect(ofType(events, "land")).toHaveLength(1);
    expect(body.y).toBe(0.5);
    expect(body.vy).toBe(0);
    expect(body.supported).toBe(true);
    expect(body.sleeping).toBe(true);
    expect(sim.settled()).toBe(true);
  });

  test("a body created on the ground starts supported", () => {
    const sim = world();
    const body = tank(sim, 10, 0.5);
    expect(body.supported).toBe(true);
    run(sim, 1);
    expect(body.y).toBe(0.5);
  });

  test("resting on the very edge of a ledge is stable for ten seconds", () => {
    const sim = world([LEDGE]);
    const body = tank(sim, 58.99, 7.5);
    const start = { x: body.x, y: body.y };
    const events = run(sim, 600);
    expect(body.x).toBe(start.x);
    expect(body.y).toBe(start.y);
    expect(ofType(events, "fall")).toHaveLength(0);
    const off = tank(sim, 59.01, 7.5);
    run(sim, 60);
    expect(off.y).toBeLessThan(6);
  });

  test("Coulomb friction decelerates at friction times gravity", () => {
    const sim = world();
    const body = tank(sim, 5, 0.5, { vx: 6, friction: 0.5 });
    sim.step();
    expect(body.vx).toBeCloseTo(6 - 0.5 * G * DT, 12);
    run(sim, 120);
    expect(body.vx).toBe(0);
    const distance = body.x - 5;
    expect(distance).toBeGreaterThan((6 * 6) / (2 * 0.5 * G) - 0.2);
    expect(distance).toBeLessThan((6 * 6) / (2 * 0.5 * G) + 0.2);
  });

  test("walls stop a body at their face and bounce it with restitution", () => {
    const sim = world([FLOOR, WALL]);
    const body = tank(sim, 25, 0.5, { vx: 20, friction: 0 });
    const events = run(sim, 30);
    expect(body.x).toBeLessThanOrEqual(29);
    expect(body.vx).toBeLessThan(0);
    expect(body.vx).toBeCloseTo(-20 * 0.25, 9);
    expect(ofType(events, "land")).toHaveLength(0);
  });

  test("ceilings stop upward motion and send the body back down", () => {
    const sim = world([FLOOR, { minX: 0, minY: 4, maxX: 40, maxY: 5 }]);
    const body = tank(sim, 10, 0.5);
    sim.launch(body, 0, 25);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      sim.step();
      peak = Math.max(peak, body.y);
    }
    expect(peak).toBe(3.5);
    expect(body.y).toBe(0.5);
  });

  test("bodies below the kill line fall out and take followers along", () => {
    const sim = world([]);
    const body = tank(sim, 10, 0);
    const shell = sim.createBody({
      kind: "static",
      shape: { type: "circle", radius: 2 },
      x: 0,
      y: 0,
      follow: body,
      data: "shell",
    });
    const events = run(sim, 120);
    expect(ofType(events, "fall").map((event) => event.body)).toEqual([body]);
    expect(body.removed).toBe(true);
    expect(shell.removed).toBe(true);
    expect(sim.bodies).toEqual([]);
  });
});

describe("portals", () => {
  test("bodies wrap across both edges and report it", () => {
    const sim = world([]);
    const right = tank(sim, 63.9, 10, { vx: 12 });
    const left = tank(sim, 0.1, 10, { vx: -12 });
    const events = ofType(run(sim, 2), "wrap");
    expect(events.map((event) => event.body)).toEqual([right, left]);
    expect(events[0]?.fromX).toBeGreaterThanOrEqual(64);
    expect(right.x).toBeLessThan(1);
    expect(events[1]?.fromX).toBeLessThan(0);
    expect(left.x).toBeGreaterThan(63);
  });

  test("terrain across the seam stops a body mid-crossing", () => {
    const sim = world([FLOOR, { minX: 1, minY: 0, maxX: 2, maxY: 4 }]);
    const body = tank(sim, 62.5, 2, { vx: 30, friction: 0 });
    let steps = 0;
    while (body.vx > 0 && steps < 20) {
      sim.step();
      steps += 1;
    }
    expect(body.x).toBe(0);
    expect(body.vx).toBeCloseTo(-30 * 0.25, 9);
  });
});

describe("bullets", () => {
  test("fly a ballistic arc with constant horizontal speed", () => {
    const sim = world([]);
    const shot = sim.createBody({
      kind: "bullet",
      x: 1,
      y: 1,
      vx: 10,
      vy: 15,
      data: "shot",
    });
    let vy = 15;
    let y = 1;
    for (let i = 0; i < 40; i++) {
      sim.step();
      vy -= G * DT;
      y += vy * DT;
      expect(shot.vx).toBe(10);
      expect(shot.vy).toBe(vy);
      expect(shot.y).toBe(y);
    }
  });

  test("never tunnel through thin terrain, boxes, circles, or segments", () => {
    const rng = deriveRng(7, "tunnel");
    for (let trial = 0; trial < 300; trial++) {
      const speed = 10 + rng() * 6000;
      const target = Math.floor(rng() * 4);
      const sim = world(
        target === 0 ? [{ minX: 30, minY: -50, maxX: 30.01, maxY: 50 }] : [],
      );
      if (target === 1)
        sim.createBody({
          kind: "static",
          shape: { type: "box", halfWidth: 0.005, halfHeight: 50 },
          x: 30,
          y: 0,
          data: "box",
        });
      if (target === 2)
        sim.createBody({
          kind: "static",
          shape: { type: "circle", radius: 0.05 },
          x: 30,
          y: 0,
          data: "ball",
        });
      if (target === 3)
        sim.createBody({
          kind: "static",
          shape: { type: "segment", x0: 0, y0: -50, x1: 0, y1: 50 },
          x: 30,
          y: 0,
          data: "wall",
        });
      const shot = sim.createBody({
        kind: "bullet",
        x: 10,
        y: 0,
        vx: speed,
        vy: 0,
        gravityScale: 0,
        data: "shot",
      });
      let hits: Extract<PhysicsEvent<string>, { type: "hit" }>[] = [];
      for (let i = 0; i < 200 && hits.length === 0; i++)
        hits = ofType(sim.step(), "hit");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.x).toBeCloseTo(
        target === 0 ? 30 : target === 1 ? 29.995 : target === 2 ? 29.95 : 30,
        6,
      );
      expect(shot.x).toBeLessThan(31);
    }
  });

  test("hits report the struck body and the surface normal", () => {
    const sim = world([FLOOR]);
    const crate = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 20,
      y: 1,
      data: "crate",
    });
    sim.createBody({
      kind: "bullet",
      x: 10,
      y: 1,
      vx: 60,
      vy: 0,
      gravityScale: 0,
      data: "a",
    });
    sim.createBody({
      kind: "bullet",
      x: 5,
      y: 3,
      vx: 0,
      vy: -60,
      gravityScale: 0,
      data: "b",
    });
    const hits = ofType(run(sim, 10), "hit");
    const side = hits.find((hit) => hit.body.data === "a");
    const top = hits.find((hit) => hit.body.data === "b");
    expect(side?.other).toBe(crate);
    expect([side?.x, side?.normalX, side?.normalY]).toEqual([19, -1, 0]);
    expect(top?.other).toBeNull();
    expect([top?.y, top?.normalX, top?.normalY]).toEqual([0, 0, 1]);
  });

  test("layers, masks, and groups filter what a bullet can hit", () => {
    const sim = world([]);
    const friend = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 15,
      y: 0,
      group: 1,
      data: "friend",
    });
    const ghost = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 20,
      y: 0,
      layer: 2,
      data: "ghost",
    });
    const foe = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 25,
      y: 0,
      group: 2,
      data: "foe",
    });
    sim.createBody({
      kind: "bullet",
      x: 10,
      y: 0,
      vx: 120,
      vy: 0,
      gravityScale: 0,
      mask: 1,
      group: 1,
      data: "shot",
    });
    const hits = ofType(run(sim, 10), "hit");
    expect(hits[0]?.other).toBe(foe);
    expect(
      hits.some((hit) => hit.other === friend || hit.other === ghost),
    ).toBe(false);
  });

  test("sensor circles stop a bullet that starts inside, solid ones do not", () => {
    const sim = world([]);
    const mine = sim.createBody({
      kind: "static",
      shape: { type: "circle", radius: 1 },
      x: 10,
      y: 0,
      sensor: true,
      data: "mine",
    });
    const bubble = sim.createBody({
      kind: "static",
      shape: { type: "circle", radius: 2 },
      x: 30,
      y: 0,
      data: "bubble",
    });
    sim.createBody({
      kind: "bullet",
      x: 10.2,
      y: 0,
      vx: 60,
      vy: 0,
      gravityScale: 0,
      data: "a",
    });
    sim.createBody({
      kind: "bullet",
      x: 30.5,
      y: 0,
      vx: 60,
      vy: 0,
      gravityScale: 0,
      data: "b",
    });
    const hits = ofType(sim.step(), "hit");
    expect(hits.map((hit) => hit.other)).toEqual([mine]);
    expect(hits[0]?.x).toBe(10.2);
    expect(bubble.removed).toBe(false);
  });

  test("segments reflect cleanly from the reported normal", () => {
    const sim = world([]);
    sim.createBody({
      kind: "static",
      shape: { type: "segment", x0: 1, y0: -1, x1: -1, y1: 1 },
      x: 20,
      y: 0,
      data: "wall",
    });
    sim.createBody({
      kind: "bullet",
      x: 10,
      y: 0,
      vx: 60,
      vy: 0,
      gravityScale: 0,
      data: "a",
    });
    const hit = ofType(run(sim, 10), "hit")[0];
    expect(hit?.normalX).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(hit?.normalY).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  test("bullets wrap through portals and see bodies across the seam", () => {
    const sim = world([]);
    const target = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 0.5, halfHeight: 1 },
      x: 1,
      y: 0,
      data: "target",
    });
    const shot = sim.createBody({
      kind: "bullet",
      x: 62,
      y: 0,
      vx: 60,
      vy: 0,
      gravityScale: 0,
      data: "a",
    });
    const events = run(sim, 4);
    expect(ofType(events, "wrap")).toHaveLength(1);
    const hit = ofType(events, "hit")[0];
    expect(hit?.other).toBe(target);
    expect(shot.x).toBeCloseTo(0.5, 9);
  });

  test("bullets below the kill line are removed", () => {
    const sim = world([], { killY: -1 });
    const shot = sim.createBody({
      kind: "bullet",
      x: 5,
      y: 0,
      vx: 0,
      vy: -30,
      data: "a",
    });
    const events = run(sim, 5);
    expect(ofType(events, "fall")[0]?.body).toBe(shot);
    expect(sim.bulletCount).toBe(0);
    expect(sim.settled()).toBe(true);
  });
});

describe("sensors and followers", () => {
  test("sensors report overlapping bodies every step, filtered by layer", () => {
    const sim = world();
    const body = tank(sim, 10, 0.5);
    const pad = sim.createBody({
      kind: "static",
      shape: { type: "circle", radius: 0.5 },
      x: 11.2,
      y: 0.4,
      sensor: true,
      data: "pad",
    });
    const hidden = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 0,
      sensor: true,
      mask: 4,
      data: "hidden",
    });
    const events = ofType(run(sim, 3), "sensor");
    expect(events).toHaveLength(3);
    expect(
      events.every((event) => event.body === body && event.sensor === pad),
    ).toBe(true);
    expect(events.some((event) => event.sensor === hidden)).toBe(false);
  });

  test("followers move with their body and block bullets", () => {
    const sim = world([]);
    const body = tank(sim, 10, 10, { vx: 6 });
    const bubble = sim.createBody({
      kind: "static",
      shape: { type: "circle", radius: 2 },
      x: 0,
      y: 0,
      follow: body,
      data: "bubble",
    });
    expect([bubble.x, bubble.y]).toEqual([10, 10]);
    run(sim, 10);
    expect(bubble.x).toBe(body.x);
    expect(bubble.y).toBe(body.y);
    sim.createBody({
      kind: "bullet",
      x: body.x - 6,
      y: body.y,
      vx: 120,
      vy: 0,
      gravityScale: 0,
      data: "a",
    });
    const hit = ofType(run(sim, 3), "hit")[0];
    expect(hit?.other).toBe(bubble);
  });
});

describe("impulses", () => {
  test("change velocity by impulse over mass", () => {
    const sim = world();
    const light = tank(sim, 10, 0.5, { mass: 0.5 });
    const heavy = tank(sim, 20, 0.5, { mass: 2 });
    sim.applyImpulse(light, 3, 0);
    sim.applyImpulse(heavy, 3, 0);
    expect(light.vx * light.mass).toBe(3);
    expect(heavy.vx * heavy.mass).toBe(3);
    expect(light.vx).toBe(4 * heavy.vx);
    run(sim, 120);
    expect(light.x - 10).toBeGreaterThan(heavy.x - 20);
  });

  test("an upward impulse lifts a body off its support and wakes it", () => {
    const sim = world();
    const body = tank(sim, 10, 0.5);
    run(sim, 30);
    expect(body.sleeping).toBe(true);
    sim.applyImpulse(body, 0, 4);
    expect(body.supported).toBe(false);
    expect(body.sleeping).toBe(false);
    sim.step();
    expect(body.y).toBeGreaterThan(0.5);
  });

  test("launch replaces any drift so the same launch gives the same path", () => {
    const paths: number[][] = [];
    for (const drift of [0, 3, -2]) {
      const sim = world();
      const body = tank(sim, 10, 0.5, { vx: drift });
      sim.launch(body, 4, 12);
      const path: number[] = [];
      for (let i = 0; i < 40; i++) {
        sim.step();
        path.push(body.x, body.y);
      }
      paths.push(path);
    }
    expect(paths[1]).toEqual(paths[0] ?? []);
    expect(paths[2]).toEqual(paths[0] ?? []);
  });

  test("static bodies ignore impulses", () => {
    const sim = world();
    const post = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 5,
      y: 1,
      data: "post",
    });
    sim.applyImpulse(post, 10, 10);
    expect([post.vx, post.vy]).toEqual([0, 0]);
    expect(() =>
      sim.createBody({
        kind: "bullet",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        mass: 0,
        data: "bad",
      }),
    ).toThrow();
  });
});

describe("queries", () => {
  test("raycasts return the nearest hit with its normal", () => {
    const sim = world([FLOOR, WALL]);
    const crate = sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 20,
      y: 1,
      layer: 2,
      data: "crate",
    });
    const first = sim.raycast(10, 1, 30, 0);
    expect(first?.body).toBe(crate);
    expect(first?.x).toBe(19);
    const past = sim.raycast(10, 1, 30, 0, { mask: 1 });
    expect(past?.body).toBeNull();
    expect(past?.x).toBe(30);
    expect([past?.normalX, past?.normalY]).toEqual([-1, 0]);
    expect(sim.raycast(10, 5, 0, 2)).toBeNull();
  });

  test("line of sight is blocked by terrain only", () => {
    const sim = world([FLOOR, WALL]);
    sim.createBody({
      kind: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 20,
      y: 3,
      data: "crate",
    });
    expect(sim.lineOfSight(10, 3, 25, 3)).toBe(true);
    expect(sim.lineOfSight(25, 3, 35, 3)).toBe(false);
    expect(sim.lineOfSight(25, 10, 35, 10, 0.01)).toBe(true);
  });

  test("delta and wrapPosition use the shortest way around", () => {
    const sim = world([]);
    expect(sim.delta(63, 1)).toBe(2);
    expect(sim.wrapPosition(-1)).toBe(63);
    const flat = world([], { wrap: false });
    expect(flat.delta(63, 1)).toBe(-62);
    expect(flat.wrapPosition(-1)).toBe(-1);
  });
});

describe("determinism", () => {
  function scenario(): number[] {
    const sim = world([FLOOR, LEDGE, WALL]);
    const bodies: Body<string>[] = [];
    const rng = deriveRng(11, "scenario");
    for (let i = 0; i < 12; i++)
      bodies.push(
        tank(sim, rng() * 64, 2 + rng() * 10, {
          mass: 0.5 + rng() * 2,
          vx: rng() * 20 - 10,
          vy: rng() * 10,
        }),
      );
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      if (i % 50 === 0)
        for (const body of bodies)
          if (!body.removed) sim.applyImpulse(body, rng() * 6 - 3, rng() * 8);
      sim.step();
      for (const body of bodies) out.push(body.x, body.y, body.vx, body.vy);
    }
    return out;
  }

  test("the same inputs produce bit-identical results, even interleaved", () => {
    const first = scenario();
    world().step();
    const second = scenario();
    expect(second).toEqual(first);
  });
});
