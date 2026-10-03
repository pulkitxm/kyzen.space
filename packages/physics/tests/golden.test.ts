import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chachaBlock,
  datan2,
  dcos,
  deriveRng,
  deriveSecret,
  dsin,
  secretWord,
} from "../src/math";
import { World } from "../src/world";

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const GOLDEN_TRIG =
  "0803f1fff97a87263fb63686551f593a4cccb221afaf4dd65fa8f9e414d4e8ab";
const GOLDEN_RNG =
  "2e364cc86f5eaa173de3c4dd25dd51471d5d0851384d1a1f32952d63cda3dbb8";
const GOLDEN_CHACHA =
  "6f4f4c6aefb8f6768cc2165d6f5dc3c0a21f16be2b616d92ff840e772a6c1351";
const GOLDEN_SECRET =
  "801c4293a90ed99fa916e7f3088a9fbbba4df017da6dd353d827571f6412b436";
const GOLDEN_WORLD =
  "10ad81f9bd2992a1f37c818d21b41155c8b0cb9cb24a01e23284c3ebbd63eb27";

describe("cross-runtime golden hashes", () => {
  test("polynomial trig produces deterministic values", () => {
    const angles = [-180, -135, -90, -45, 0, 30, 45, 60, 90, 120, 135, 180];
    const values = angles.flatMap((a) => [
      dsin(a),
      dcos(a),
      datan2(dsin(a), dcos(a)),
    ]);
    const hash = sha(values.map((v) => v.toFixed(12)).join(","));
    expect(hash).toBe(GOLDEN_TRIG);
  });

  test("seeded RNG produces deterministic sequences", () => {
    const seeds = [0, 1, 42, 12345, 2 ** 31 - 1];
    const values: number[] = [];
    for (const seed of seeds) {
      const rng = deriveRng(seed, "test");
      for (let i = 0; i < 10; i++) values.push(rng());
    }
    const hash = sha(values.map((v) => v.toFixed(12)).join(","));
    expect(hash).toBe(GOLDEN_RNG);
  });

  test("ChaCha20 matches RFC 7539 and is deterministic", () => {
    const key = [
      0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514,
      0x1b1a1918, 0x1f1e1d1c,
    ];
    const result = chachaBlock(key, 1, 0x09000000, 0x4a000000, 0);
    const hash = sha(
      result
        .slice(0, 8)
        .map((w) => w.toString(16).padStart(8, "0"))
        .join(""),
    );
    expect(hash).toBe(GOLDEN_CHACHA);
  });

  test("secret derivation is deterministic", () => {
    const secret = deriveSecret(42);
    const words = [1, 2, 3, 4, 5].map((n) => secretWord(secret, n, "round"));
    const hash = sha(
      words.map((w) => w.toString(16).padStart(8, "0")).join(""),
    );
    expect(hash).toBe(GOLDEN_SECRET);
  });

  test("physics simulation is deterministic across runs", () => {
    const positions: number[] = [];
    for (let run = 0; run < 2; run++) {
      const world = new World({
        gravity: 30,
        dt: 1 / 60,
        width: 200,
        wrapX: true,
        friction: 300,
        restitution: 0.3,
      });
      world.setStaticBoxes([
        { x: 50, y: 0, hw: 100, hh: 2 },
        { x: 150, y: 10, hw: 20, hh: 2 },
      ]);
      const body1 = world.addBody({
        id: "a",
        type: "dynamic",
        shape: { type: "box", halfWidth: 1.5, halfHeight: 2 },
        x: 10,
        y: 50,
        vx: 5,
        vy: 10,
      });
      const body2 = world.addBody({
        id: "b",
        type: "dynamic",
        shape: { type: "circle", radius: 1 },
        x: 180,
        y: 30,
        vx: -3,
        vy: 0,
      });
      for (let i = 0; i < 120; i++) {
        world.step();
        if (i % 20 === 0) {
          positions.push(body1.x, body1.y, body1.vx, body1.vy);
          positions.push(body2.x, body2.y, body2.vx, body2.vy);
        }
      }
    }
    const half = positions.length / 2;
    const firstRun = positions.slice(0, half);
    const secondRun = positions.slice(half);
    expect(firstRun).toEqual(secondRun);
    const hash = sha(firstRun.map((v) => v.toFixed(8)).join(","));
    expect(hash).toBe(GOLDEN_WORLD);
  });
});
