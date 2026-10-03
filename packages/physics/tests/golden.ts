import {
  chachaBlock,
  checksum,
  datan2,
  dcos,
  deriveRng,
  deriveSecret,
  dsin,
  secretWord,
} from "../src/math";
import { Terrain } from "../src/terrain";
import { World } from "../src/world";

export const GOLDEN: Record<string, number> = {
  trig: 3674908139,
  rng: 1566185810,
  chacha: 1146357952,
  secret: 3928243935,
  wrapped: 1001211173,
  bounded: 2514445523,
};

function trig(): number {
  const values: number[] = [];
  for (let deg = -180; deg <= 180; deg += 7.5)
    values.push(dsin(deg), dcos(deg), datan2(dsin(deg), dcos(deg)));
  return checksum(values);
}

function rng(): number {
  const values: number[] = [];
  for (const seed of [0, 1, 42, 12345, 2147483647]) {
    const next = deriveRng(seed, "test");
    for (let i = 0; i < 10; i++) values.push(next());
  }
  return checksum(values);
}

function chacha(): number {
  const key = [
    0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514,
    0x1b1a1918, 0x1f1e1d1c,
  ];
  return checksum(chachaBlock(key, 1, 0x09000000, 0x4a000000, 0));
}

function secret(): number {
  const words = deriveSecret(42);
  return checksum([1, 2, 3, 4, 5].map((n) => secretWord(words, n, "round")));
}

function world(wrap: boolean): number {
  const terrain = new Terrain({
    boxes: [
      { minX: 0, minY: -3, maxX: 26, maxY: 0 },
      { minX: 34, minY: -3, maxX: 64, maxY: 0 },
      { minX: 8, minY: 6, maxX: 18, maxY: 7 },
      { minX: 44, minY: 0, maxX: 45, maxY: 4 },
    ],
    width: 64,
    wrap,
  });
  const sim = new World<number>({
    terrain,
    gravity: 30,
    dt: 1 / 60,
    killY: -6,
  });
  const random = deriveRng(2026, wrap ? "wrap" : "flat");
  const bodies = Array.from({ length: 8 }, (_, i) =>
    sim.createBody({
      kind: "dynamic",
      shape: { type: "box", halfWidth: 0.8 + random(), halfHeight: 0.6 },
      x: random() * 64,
      y: 1 + random() * 12,
      vx: random() * 16 - 8,
      vy: random() * 12,
      mass: 0.5 + random() * 2,
      friction: 0.45,
      restitution: 0.15,
      group: i + 1,
      data: i,
    }),
  );
  sim.createBody({
    kind: "static",
    shape: { type: "circle", radius: 0.9 },
    x: 20,
    y: 0.3,
    sensor: true,
    data: 100,
  });
  const values: number[] = [];
  for (let step = 0; step < 360; step++) {
    if (step % 30 === 0) {
      const angle = random() * 180;
      sim.createBody({
        kind: "bullet",
        x: random() * 64,
        y: 2 + random() * 6,
        vx: dcos(angle) * 30,
        vy: dsin(angle) * 30,
        data: 200 + step,
      });
    }
    for (const event of sim.step()) {
      values.push(event.body.data, event.type.length);
      if (event.type === "hit") {
        values.push(event.x, event.y, event.normalX, event.normalY);
        sim.destroyBody(event.body);
        for (const body of bodies)
          if (!body.removed && Math.abs(sim.delta(event.x, body.x)) < 4)
            sim.applyImpulse(body, sim.delta(event.x, body.x), 3);
      }
    }
    for (const body of bodies) values.push(body.x, body.y, body.vx, body.vy);
  }
  return checksum(values);
}

export function measure(): Record<string, number> {
  return {
    trig: trig(),
    rng: rng(),
    chacha: chacha(),
    secret: secret(),
    wrapped: world(true),
    bounded: world(false),
  };
}
