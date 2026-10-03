import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import type {
  CarFootballMove,
  CarFootballState,
  CarFootballTeam,
  GameEngine,
  Outcome,
  Seat,
} from "@kyzen/shared/types";

export const FIELD_HALF_LENGTH = 40;
const FIELD_HALF_WIDTH = 25;
const GOAL_HALF_WIDTH = 8;
const GOAL_HEIGHT = 7;
export const BALL_RADIUS = 1.8;
export const MATCH_SECONDS = 180;

const CAR_RADIUS = 1.6;
const CAR_HEIGHT = 1.05;
const CEILING = 18;
const MAX_CAR_SPEED = 28;
const MAX_BALL_SPEED = 42;

const CAR_FOOTBALL_ROLES = [
  "blue-1",
  "orange-1",
  "blue-2",
  "orange-2",
] as const;

function teamForRole(role: string): CarFootballTeam {
  return role.startsWith("orange") ? "orange" : "blue";
}

function kickoffCar(
  role: string,
  index: number,
): CarFootballState["cars"][number] {
  const blue = teamForRole(role) === "blue";
  return {
    role,
    team: blue ? "blue" : "orange",
    position: { x: blue ? -29 : 29, y: index < 2 ? -9 : 9, z: CAR_HEIGHT },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: blue ? 0 : Math.PI,
    boost: 33,
    grounded: true,
    jumpHeld: false,
  };
}

function kickoffCars(): CarFootballState["cars"] {
  return CAR_FOOTBALL_ROLES.map(kickoffCar);
}

function resetKickoff(
  state: CarFootballState,
  phase: "kickoff" | "goal",
): CarFootballState {
  return {
    ...state,
    phase,
    pauseRemaining: phase === "goal" ? 2.5 : 3,
    ball: {
      position: { x: 0, y: 0, z: BALL_RADIUS },
      velocity: { x: 0, y: 0, z: 0 },
    },
    cars: kickoffCars(),
  };
}

function capPlanarVelocity(
  velocity: { x: number; y: number },
  max: number,
): void {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > max) {
    velocity.x = (velocity.x / speed) * max;
    velocity.y = (velocity.y / speed) * max;
  }
}

function moveCar(
  car: CarFootballState["cars"][number],
  input: CarFootballMove | undefined,
  dt: number,
): void {
  const throttle = input?.throttle ?? 0;
  const steer = input?.steer ?? 0;
  const boosting = Boolean(input?.boost && car.boost > 0);
  const speed = Math.hypot(car.velocity.x, car.velocity.y);
  const turnRate = car.grounded ? (input?.handbrake ? 3.8 : 2.7) : 1.3;
  car.yaw +=
    steer *
    turnRate *
    dt *
    (car.grounded ? Math.max(0.3, Math.min(1, speed / 7)) : 1);

  const directionX = Math.cos(car.yaw);
  const directionY = Math.sin(car.yaw);
  const acceleration = throttle * (car.grounded ? 22 : 7) + (boosting ? 38 : 0);
  car.velocity.x += directionX * acceleration * dt;
  car.velocity.y += directionY * acceleration * dt;
  if (boosting && !car.grounded) car.velocity.z += 6 * dt;
  car.boost = Math.max(0, Math.min(100, car.boost + (boosting ? -32 : 5) * dt));

  if (input?.jump && !car.jumpHeld && car.grounded) {
    car.velocity.z = 9.5;
    car.grounded = false;
  }
  car.jumpHeld = input?.jump ?? false;
  car.velocity.z -= 20 * dt;

  const drag = Math.exp(
    -(car.grounded ? (input?.handbrake ? 2.2 : 1.3) : 0.2) * dt,
  );
  car.velocity.x *= drag;
  car.velocity.y *= drag;
  capPlanarVelocity(car.velocity, MAX_CAR_SPEED);
  car.position.x += car.velocity.x * dt;
  car.position.y += car.velocity.y * dt;
  car.position.z += car.velocity.z * dt;

  if (car.position.z <= CAR_HEIGHT) {
    car.position.z = CAR_HEIGHT;
    car.velocity.z = 0;
    car.grounded = true;
  }
  if (car.position.z >= CEILING - CAR_HEIGHT) {
    car.position.z = CEILING - CAR_HEIGHT;
    car.velocity.z = Math.min(0, car.velocity.z);
  }
  const xLimit = FIELD_HALF_LENGTH - CAR_RADIUS;
  const yLimit = FIELD_HALF_WIDTH - CAR_RADIUS;
  if (Math.abs(car.position.x) > xLimit) {
    car.position.x = Math.sign(car.position.x) * xLimit;
    car.velocity.x *= -0.35;
  }
  if (Math.abs(car.position.y) > yLimit) {
    car.position.y = Math.sign(car.position.y) * yLimit;
    car.velocity.y *= -0.35;
  }
}

function collideCars(cars: CarFootballState["cars"]): void {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b || Math.abs(a.position.z - b.position.z) > CAR_HEIGHT * 2)
        continue;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= CAR_RADIUS * 2 || distance < 0.0001) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const separation = (CAR_RADIUS * 2 - distance) / 2;
      a.position.x -= nx * separation;
      a.position.y -= ny * separation;
      b.position.x += nx * separation;
      b.position.y += ny * separation;
      const relative =
        (b.velocity.x - a.velocity.x) * nx + (b.velocity.y - a.velocity.y) * ny;
      if (relative < 0) {
        const impulse = -relative * 0.65;
        a.velocity.x -= nx * impulse;
        a.velocity.y -= ny * impulse;
        b.velocity.x += nx * impulse;
        b.velocity.y += ny * impulse;
      }
    }
  }
}

function collideBallWithCars(state: CarFootballState): void {
  const ball = state.ball;
  for (const car of state.cars) {
    const dx = ball.position.x - car.position.x;
    const dy = ball.position.y - car.position.y;
    const dz = ball.position.z - car.position.z;
    const distance = Math.hypot(dx, dy, dz);
    const contact = BALL_RADIUS + CAR_RADIUS;
    if (distance >= contact || distance < 0.0001) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    const nz = dz / distance;
    const overlap = contact - distance;
    ball.position.x += nx * overlap;
    ball.position.y += ny * overlap;
    ball.position.z += nz * overlap;
    const relative =
      (car.velocity.x - ball.velocity.x) * nx +
      (car.velocity.y - ball.velocity.y) * ny +
      (car.velocity.z - ball.velocity.z) * nz;
    const impulse = Math.max(2.5, relative * 1.65 + 3);
    ball.velocity.x += nx * impulse + car.velocity.x * 0.16;
    ball.velocity.y += ny * impulse + car.velocity.y * 0.16;
    ball.velocity.z += nz * impulse + Math.max(0, car.velocity.z) * 0.12;
  }
}

function moveBall(state: CarFootballState, dt: number): CarFootballTeam | null {
  const ball = state.ball;
  ball.velocity.z -= 15 * dt;
  const drag = Math.exp(-0.08 * dt);
  ball.velocity.x *= drag;
  ball.velocity.y *= drag;
  ball.velocity.z *= drag;
  const speed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);
  if (speed > MAX_BALL_SPEED) {
    const ratio = MAX_BALL_SPEED / speed;
    ball.velocity.x *= ratio;
    ball.velocity.y *= ratio;
    ball.velocity.z *= ratio;
  }
  ball.position.x += ball.velocity.x * dt;
  ball.position.y += ball.velocity.y * dt;
  ball.position.z += ball.velocity.z * dt;

  if (ball.position.z < BALL_RADIUS) {
    ball.position.z = BALL_RADIUS;
    ball.velocity.z =
      Math.abs(ball.velocity.z) < 1 ? 0 : Math.abs(ball.velocity.z) * 0.72;
    ball.velocity.x *= 0.985;
    ball.velocity.y *= 0.985;
  }
  if (ball.position.z > CEILING - BALL_RADIUS) {
    ball.position.z = CEILING - BALL_RADIUS;
    ball.velocity.z = -Math.abs(ball.velocity.z) * 0.72;
  }
  if (Math.abs(ball.position.y) > FIELD_HALF_WIDTH - BALL_RADIUS) {
    ball.position.y =
      Math.sign(ball.position.y) * (FIELD_HALF_WIDTH - BALL_RADIUS);
    ball.velocity.y *= -0.78;
  }
  if (Math.abs(ball.position.x) > FIELD_HALF_LENGTH - BALL_RADIUS) {
    const inGoal =
      Math.abs(ball.position.y) < GOAL_HALF_WIDTH - BALL_RADIUS &&
      ball.position.z < GOAL_HEIGHT - BALL_RADIUS;
    if (inGoal) {
      if (Math.abs(ball.position.x) >= FIELD_HALF_LENGTH)
        return ball.position.x > 0 ? "blue" : "orange";
      return null;
    }
    ball.position.x =
      Math.sign(ball.position.x) * (FIELD_HALF_LENGTH - BALL_RADIUS);
    ball.velocity.x *= -0.78;
  }
  return null;
}

function outcomeFor(state: CarFootballState): Outcome {
  if (state.phase !== "finished") return { status: "active" };
  const winnerRole =
    state.score.blue > state.score.orange
      ? "blue-1"
      : state.score.orange > state.score.blue
        ? "orange-1"
        : null;
  return { status: "completed", winnerRole, draw: winnerRole === null };
}

export const carFootballEngine: GameEngine<CarFootballState, CarFootballMove> =
  {
    type: CAR_FOOTBALL,
    mode: "realtime",
    minPlayers: 4,
    maxPlayers: 4,
    roles: CAR_FOOTBALL_ROLES,
    tickRate: 30,

    createInitialState(_seats: Seat[]): CarFootballState {
      return resetKickoff(
        {
          phase: "kickoff",
          timeRemaining: MATCH_SECONDS,
          pauseRemaining: 0,
          score: { blue: 0, orange: 0 },
          lastScorer: null,
          ball: {
            position: { x: 0, y: 0, z: BALL_RADIUS },
            velocity: { x: 0, y: 0, z: 0 },
          },
          cars: kickoffCars(),
        },
        "kickoff",
      );
    },

    step(state, inputs, dt) {
      if (state.phase === "finished")
        return { state, outcome: outcomeFor(state) };
      const next: CarFootballState = {
        ...state,
        score: { ...state.score },
        ball: {
          position: { ...state.ball.position },
          velocity: { ...state.ball.velocity },
        },
        cars: state.cars.map((car) => ({
          ...car,
          position: { ...car.position },
          velocity: { ...car.velocity },
        })),
      };

      if (next.phase === "kickoff" || next.phase === "goal") {
        next.pauseRemaining = Math.max(0, next.pauseRemaining - dt);
        if (next.pauseRemaining === 0) {
          next.phase = next.timeRemaining > 0 ? "play" : "overtime";
        }
        return { state: next, outcome: { status: "active" } };
      }

      for (const car of next.cars) moveCar(car, inputs.get(car.role), dt);
      collideCars(next.cars);
      collideBallWithCars(next);
      const scorer = moveBall(next, dt);
      if (scorer) {
        next.score[scorer] += 1;
        next.lastScorer = scorer;
        if (next.phase === "overtime") next.phase = "finished";
        else
          return {
            state: resetKickoff(next, "goal"),
            outcome: { status: "active" },
          };
      }

      if (next.phase === "play") {
        next.timeRemaining = Math.max(0, next.timeRemaining - dt);
        if (next.timeRemaining === 0) {
          next.phase =
            next.score.blue === next.score.orange ? "overtime" : "finished";
        }
      }
      return { state: next, outcome: outcomeFor(next) };
    },
  };
