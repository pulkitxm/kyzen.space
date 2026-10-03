import type {
  TankAction,
  TankArenaState,
  TankArenaTank,
  TankKind,
} from "@kyzen/shared/types";
import { MODULE_WIDTH } from "./constants";

const HIDDEN_SECRET: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];

type State = TankArenaState;

export function roleForSeat(index: number): string {
  return `p${index + 1}`;
}

export function defaultKind(index: number): TankKind {
  return index % 2 === 0 ? "bastion" : "kestrel";
}

export function seatIndex(state: State, role: string): number {
  return state.seats.findIndex((seat) => seat.role === role);
}

export function arenaWidth(state: Pick<State, "modules">): number {
  return state.modules * MODULE_WIDTH;
}

export function roleTeam(state: State, role: string): string | null {
  return state.seats.find((seat) => seat.role === role)?.team ?? null;
}

export function teamsOf(
  state: State,
  tanks: readonly TankArenaTank[],
): string[] {
  const teams: string[] = [];
  tanks.forEach((tank, index) => {
    const team = state.seats[index]?.team;
    if (tank.alive && team !== undefined && !teams.includes(team))
      teams.push(team);
  });
  return teams;
}

export function aliveTeams(state: State): string[] {
  return teamsOf(state, state.tanks);
}

export function cooldownsOf(
  state: State,
  role: string,
): { specialA: number; specialB: number } {
  const tank = state.tanks[seatIndex(state, role)];
  return tank ? { ...tank.cooldowns } : { specialA: 0, specialB: 0 };
}

export function isJumpAction(
  kind: TankKind | null,
  action: TankAction,
): boolean {
  return action === "jump" || (action === "specialB" && kind === "kestrel");
}

export function canUse(
  state: State,
  role: string,
  action: TankAction,
): boolean {
  if (state.phase !== "plan" || state.submitted.includes(role)) return false;
  const tank = state.tanks[seatIndex(state, role)];
  if (!tank?.alive || !tank.kind) return false;
  if (action === "specialA") return tank.cooldowns.specialA === 0;
  if (action === "specialB") return tank.cooldowns.specialB === 0;
  return true;
}

export function secretOf(state: Pick<State, "secret">): readonly number[] {
  return state.secret ?? HIDDEN_SECRET;
}
