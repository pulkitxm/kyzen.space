export type Outcome =
  | { status: "active" }
  | { status: "completed"; winnerRole: string | null; draw: boolean };

export type Seat = { role: string };

export type ReduceResult<State> =
  | { ok: true; state: State; outcome: Outcome }
  | { ok: false; error: string };

export type StepResult<State> = { state: State; outcome: Outcome };

export type MoveContext = { role: string };

export interface GameEngine<State, Input> {
  readonly type: string;
  readonly mode: "turn-based" | "realtime";
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly roles: readonly string[];

  createInitialState(seats: Seat[]): State;

  reduce?(state: State, ctx: MoveContext, input: Input): ReduceResult<State>;

  autoMove?(state: State, role: string): Input;

  currentRole?(state: State): string | null;

  viewFor?(state: State, role: string): State;

  step?(
    state: State,
    inputs: Map<string, Input>,
    dt: number,
  ): StepResult<State>;

  readonly tickRate?: number;
}
