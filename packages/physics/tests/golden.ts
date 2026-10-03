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
import { World } from "../src/world";

export const GOLDEN: Record<string, number> = {
  trig: 3674908139,
  rng: 1566185810,
  chacha: 1146357952,
  secret: 3928243935,
  world: 3095166529,
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

function world(): number {
  const sim = new World({
    gravity: 30,
    dt: 1 / 60,
    width: 200,
    wrapX: true,
    friction: 300,
    restitution: 0.3,
  });
  sim.setStaticBoxes([
    { x: 50, y: 0, hw: 100, hh: 2 },
    { x: 150, y: 10, hw: 20, hh: 2 },
  ]);
  const box = sim.addBody({
    id: "a",
    type: "dynamic",
    shape: { type: "box", halfWidth: 1.5, halfHeight: 2 },
    x: 10,
    y: 50,
    vx: 5,
    vy: 10,
  });
  const ball = sim.addBody({
    id: "b",
    type: "dynamic",
    shape: { type: "circle", radius: 1 },
    x: 180,
    y: 30,
    vx: -3,
    vy: 0,
  });
  const values: number[] = [];
  for (let i = 0; i < 120; i++) {
    sim.step();
    values.push(box.x, box.y, box.vx, box.vy, ball.x, ball.y, ball.vx, ball.vy);
  }
  return checksum(values);
}

export function measure(): Record<string, number> {
  return {
    trig: trig(),
    rng: rng(),
    chacha: chacha(),
    secret: secret(),
    world: world(),
  };
}
