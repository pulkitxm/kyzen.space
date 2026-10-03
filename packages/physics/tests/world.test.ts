import { describe, expect, test } from "bun:test";
import type { BodyDef } from "../src/types";
import { World } from "../src/world";

describe("World", () => {
  test("creates with default configuration", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    expect(world.gravity).toBe(30);
    expect(world.dt).toBeCloseTo(1 / 60, 10);
  });

  test("adds and retrieves bodies", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    const def: BodyDef = {
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 10,
    };
    const body = world.addBody(def);
    expect(body.id).toBe("test");
    expect(body.x).toBe(10);
    expect(body.y).toBe(10);
    expect(world.getBody("test")).toBe(body);
  });

  test("removes bodies", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    const def: BodyDef = {
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 10,
    };
    world.addBody(def);
    world.removeBody("test");
    expect(world.getBody("test")).toBeUndefined();
  });

  test("applies gravity to dynamic bodies", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    const body = world.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 100,
      vy: 0,
    });

    world.step();
    expect(body.vy).toBeLessThan(0);
    expect(body.y).toBeLessThan(100);
  });

  test("does not move static bodies", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    const body = world.addBody({
      id: "test",
      type: "static",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 10,
    });

    world.step();
    expect(body.x).toBe(10);
    expect(body.y).toBe(10);
  });

  test("wraps x position when wrapX is enabled", () => {
    const world = new World({
      gravity: 30,
      dt: 1 / 60,
      width: 100,
      wrapX: true,
    });
    const body = world.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 95,
      y: 50,
      vx: 600,
      vy: 0,
      gravityScale: 0,
    });

    world.step();
    expect(body.x).toBeGreaterThanOrEqual(0);
    expect(body.x).toBeLessThan(100);
  });
});

describe("World with static boxes", () => {
  test("body lands on static platform", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    world.setStaticBoxes([{ x: 10, y: 0, hw: 20, hh: 1 }]);

    const body = world.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 10,
      vy: 0,
    });

    for (let i = 0; i < 120; i++) {
      world.step();
    }

    expect(body.y).toBeGreaterThan(0);
    expect(body.y).toBeLessThan(5);
    expect(body.supported).toBe(true);
  });

  test("body stops at walls", () => {
    const world = new World({ gravity: 0, dt: 1 / 60, restitution: 0 });
    world.setStaticBoxes([{ x: 20, y: 5, hw: 2, hh: 10 }]);

    const body = world.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 5,
      vx: 60,
      vy: 0,
    });

    for (let i = 0; i < 60; i++) {
      world.step();
    }

    expect(body.x).toBeLessThanOrEqual(17);
    expect(body.vx + 0).toBe(0);
  });
});

describe("World sweep and raycast", () => {
  test("sweepTerrain detects collision", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    world.setStaticBoxes([{ x: 10, y: 5, hw: 2, hh: 2 }]);

    const t = world.sweepTerrain(0, 5, 20, 0);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  test("raycast hits body", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    world.addBody({
      id: "target",
      type: "dynamic",
      shape: { type: "box", halfWidth: 2, halfHeight: 2 },
      x: 10,
      y: 5,
    });

    const result = world.raycast(0, 5, 1, 0, 20);
    expect(result.hit).toBe(true);
    expect(result.body?.id).toBe("target");
  });

  test("raycast misses when no obstacle", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    const result = world.raycast(0, 5, 1, 0, 20);
    expect(result.hit).toBe(false);
  });
});

describe("World queries", () => {
  test("queryCircle finds bodies in range", () => {
    const world = new World({ gravity: 30, dt: 1 / 60 });
    world.addBody({
      id: "nearby",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 5,
      y: 5,
    });
    world.addBody({
      id: "far",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 50,
      y: 50,
    });

    const results = world.queryCircle(5, 5, 5);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("nearby");
  });
});

describe("World determinism", () => {
  test("same inputs produce same outputs", () => {
    function runSimulation(): number[] {
      const world = new World({ gravity: 30, dt: 1 / 60 });
      world.setStaticBoxes([{ x: 50, y: 0, hw: 100, hh: 1 }]);

      const body = world.addBody({
        id: "test",
        type: "dynamic",
        shape: { type: "box", halfWidth: 1, halfHeight: 1 },
        x: 10,
        y: 50,
        vx: 5,
        vy: 0,
      });

      const positions: number[] = [];
      for (let i = 0; i < 60; i++) {
        world.step();
        positions.push(body.x, body.y, body.vx, body.vy);
      }
      return positions;
    }

    const run1 = runSimulation();
    const run2 = runSimulation();
    expect(run1).toEqual(run2);
  });

  test("interleaved worlds produce identical results", () => {
    const world1 = new World({ gravity: 30, dt: 1 / 60 });
    const world2 = new World({ gravity: 30, dt: 1 / 60 });

    world1.setStaticBoxes([{ x: 50, y: 0, hw: 100, hh: 1 }]);
    world2.setStaticBoxes([{ x: 50, y: 0, hw: 100, hh: 1 }]);

    const body1 = world1.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 50,
      vx: 5,
      vy: 10,
    });

    const body2 = world2.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 50,
      vx: 5,
      vy: 10,
    });

    for (let i = 0; i < 120; i++) {
      world1.step();
      world2.step();
    }

    expect(body1.x).toBe(body2.x);
    expect(body1.y).toBe(body2.y);
    expect(body1.vx).toBe(body2.vx);
    expect(body1.vy).toBe(body2.vy);
  });
});

describe("World sleep detection", () => {
  test("body sleeps after resting", () => {
    const world = new World({
      gravity: 30,
      dt: 1 / 60,
      restSpeed: 0.05,
      restFrames: 10,
    });
    world.setStaticBoxes([{ x: 10, y: 0, hw: 20, hh: 1 }]);

    const body = world.addBody({
      id: "test",
      type: "dynamic",
      shape: { type: "box", halfWidth: 1, halfHeight: 1 },
      x: 10,
      y: 2,
      vy: 0,
    });

    let foundSleep = false;
    for (let i = 0; i < 120; i++) {
      const events = world.step();
      if (events.some((e) => e.type === "sleep" && e.bodyA === body)) {
        foundSleep = true;
        break;
      }
    }

    expect(foundSleep).toBe(true);
    expect(body.sleeping).toBe(true);
  });
});
