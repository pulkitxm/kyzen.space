import { describe, expect, test } from "bun:test";
import { CAR_FOOTBALL_BOOST_PADS } from "@kyzen/shared/constants";
import {
  carFootballMoveSchema,
  carFootballStateSchema,
} from "@kyzen/shared/types";
import {
  BALL_RADIUS,
  carFootballEngine,
  FIELD_HALF_LENGTH,
  MATCH_SECONDS,
} from "../src/games/car-football/engine";

const STEP = 1 / 30;

function initial() {
  return carFootballEngine.createInitialState([]);
}

function advance(state: ReturnType<typeof initial>, ticks: number) {
  let current = state;
  for (let i = 0; i < ticks; i++) {
    current =
      carFootballEngine.step?.(current, new Map(), STEP).state ?? current;
  }
  return current;
}

describe("Turbo Pitch engine", () => {
  test("starts with four cars, valid state, and a centered ball", () => {
    const state = initial();
    expect(carFootballStateSchema.safeParse(state).success).toBe(true);
    expect(state.cars.map((car) => car.role)).toEqual([
      ...carFootballEngine.roles,
    ]);
    expect(state.ball.position).toEqual({ x: 0, y: 0, z: BALL_RADIUS });
    expect(state.timeRemaining).toBe(MATCH_SECONDS);
  });

  test("requires bounded control inputs", () => {
    expect(
      carFootballMoveSchema.safeParse({
        throttle: 1,
        steer: -1,
        jump: true,
        boost: false,
        handbrake: false,
      }).success,
    ).toBe(true);
    expect(
      carFootballMoveSchema.safeParse({
        throttle: 10,
        steer: 0,
        jump: false,
        boost: false,
        handbrake: false,
      }).success,
    ).toBe(false);
  });

  test("steps deterministically without mutating the input state", () => {
    const state = advance(initial(), 91);
    const before = structuredClone(state);
    const controls = new Map([
      [
        "blue-1",
        {
          throttle: 1,
          steer: 0.2,
          jump: false,
          boost: true,
          handbrake: false,
        },
      ],
    ]);
    const first = carFootballEngine.step?.(state, controls, STEP);
    const second = carFootballEngine.step?.(state, controls, STEP);
    expect(first).toEqual(second);
    expect(state).toEqual(before);
    expect(first?.state.cars[0]?.position.x).toBeGreaterThan(
      state.cars[0]?.position.x ?? 0,
    );
  });

  test("scores, resets kickoff, and finishes at the time limit", () => {
    const state = advance(initial(), 91);
    state.ball.position.x = FIELD_HALF_LENGTH - 0.1;
    state.ball.velocity.x = 20;
    const result = carFootballEngine.step?.(state, new Map(), STEP);
    expect(result?.state.score.blue).toBe(1);
    expect(result?.state.phase).toBe("goal");
    const ending = {
      ...result?.state,
      timeRemaining: STEP / 2,
      phase: "play" as const,
    } as ReturnType<typeof initial>;
    const finished = carFootballEngine.step?.(ending, new Map(), STEP);
    expect(finished?.outcome).toEqual({
      status: "completed",
      winnerRole: "blue-1",
      draw: false,
    });
  });

  test("a normally moving ball crosses the open goal mouth", () => {
    const state = advance(initial(), 91);
    state.ball.position.x = FIELD_HALF_LENGTH - BALL_RADIUS - 0.2;
    state.ball.velocity.x = 20;
    let current = state;
    for (let tick = 0; tick < 5; tick++) {
      current =
        carFootballEngine.step?.(current, new Map(), STEP).state ?? current;
      if (current.score.blue) break;
    }
    expect(current.score.blue).toBe(1);
    expect(current.phase).toBe("goal");
  });

  test("the goal frame still rebounds a ball outside the opening", () => {
    const state = advance(initial(), 91);
    state.ball.position.x = FIELD_HALF_LENGTH - BALL_RADIUS - 0.2;
    state.ball.position.y = 10;
    state.ball.velocity.x = 20;
    const current = carFootballEngine.step?.(state, new Map(), STEP).state;
    expect(current?.score.blue).toBe(0);
    expect(current?.ball.velocity.x).toBeLessThan(0);
  });

  test("allows one aerial dodge, requires release, and resets after landing", () => {
    let state = advance(initial(), 91);
    const controls = {
      throttle: 1,
      steer: 0,
      jump: true,
      boost: false,
      handbrake: false,
    };
    const step = (jump: boolean) => {
      state =
        carFootballEngine.step?.(
          state,
          new Map([["blue-1", { ...controls, jump }]]),
          STEP,
        ).state ?? state;
    };
    step(true);
    expect(state.cars[0]?.jumpsUsed).toBe(1);
    step(true);
    expect(state.cars[0]?.jumpsUsed).toBe(1);
    step(false);
    const speed = state.cars[0]?.velocity.x ?? 0;
    step(true);
    expect(state.cars[0]?.jumpsUsed).toBe(2);
    expect(state.cars[0]?.velocity.x).toBeGreaterThan(speed + 10);
    step(false);
    step(true);
    expect(state.cars[0]?.jumpsUsed).toBe(2);
    state = advance(state, 150);
    expect(state.cars[0]?.jumpsUsed).toBe(0);
  });

  test("boost pickups refill once and recharge after eight seconds", () => {
    let state = advance(initial(), 91);
    const car = state.cars[0];
    const pad = CAR_FOOTBALL_BOOST_PADS[0];
    if (!car) throw new Error("Missing car");
    car.position.x = pad.x;
    car.position.y = pad.y;
    car.boost = 0;
    state = advance(state, 1);
    expect(state.cars[0]?.boost).toBe(100);
    expect(state.boostPads[0]).toBe(8);
    const after = state.cars[0];
    if (!after) throw new Error("Missing car");
    after.boost = 0;
    state = advance(state, 1);
    expect(state.cars[0]?.boost).toBeLessThan(1);
    state = advance(state, 241);
    expect(state.cars[0]?.boost).toBe(100);
  });

  test("a missing teammate can reconnect but an absent team forfeits", () => {
    const state = advance(initial(), 91);
    expect(carFootballEngine.onPlayersAbsent?.(state, ["blue-1"])).toBeNull();
    const result = carFootballEngine.onPlayersAbsent?.(state, [
      "blue-1",
      "blue-2",
    ]);
    expect(result?.outcome).toEqual({
      status: "completed",
      winnerRole: "orange-1",
      draw: false,
    });
    expect(result?.state.endReason).toBe("forfeit");
    const abandoned = carFootballEngine.onPlayersAbsent?.(
      state,
      carFootballEngine.roles,
    );
    expect(abandoned?.outcome).toEqual({
      status: "completed",
      winnerRole: null,
      draw: true,
    });
  });

  test("a tied regulation match enters sudden-death overtime", () => {
    const state = advance(initial(), 91);
    state.timeRemaining = STEP / 2;
    const overtime = carFootballEngine.step?.(state, new Map(), STEP).state;
    expect(overtime?.phase).toBe("overtime");
    if (!overtime) throw new Error("Missing overtime state");
    overtime.ball.position.x = -FIELD_HALF_LENGTH + 0.1;
    overtime.ball.velocity.x = -20;
    const winner = carFootballEngine.step?.(overtime, new Map(), STEP);
    expect(winner?.outcome).toEqual({
      status: "completed",
      winnerRole: "orange-1",
      draw: false,
    });
  });
});
