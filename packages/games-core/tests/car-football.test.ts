import { describe, expect, test } from "bun:test";
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
