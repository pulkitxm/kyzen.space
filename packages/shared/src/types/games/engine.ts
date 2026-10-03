export type BotDifficulty = "easy" | "normal" | "hard";

export type Outcome =
  | { status: "active" }
  | { status: "completed"; winnerRoles: string[]; draw: boolean };

export type Seat = { role: string; team: string; bot: BotDifficulty | null };

export type SetupOptions = { config: unknown; seed: number };

export type ReduceResult<State> =
  | { ok: true; state: State; outcome: Outcome }
  | { ok: false; error: string };

export type StepResult<State> = { state: State; outcome: Outcome };

export type MoveContext = { role: string };

export type LobbySupport = { teams: boolean; bots: boolean };

export interface GameEngine<State, Input> {
  readonly type: string;
  readonly mode: "turn-based" | "simultaneous" | "realtime";
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly lobby?: LobbySupport;

  roleForSeat(index: number): string;

  createInitialState(seats: Seat[], options: SetupOptions): State;

  reduce?(state: State, ctx: MoveContext, input: Input): ReduceResult<State>;

  autoMove?(state: State, role: string, strikes: number): Input;

  currentRole?(state: State): string | null;

  roundOf?(state: State): number;

  pendingRoles?(state: State): string[];

  roundTimeMs?(state: State): number;

  botMove?(state: State, role: string, difficulty: BotDifficulty): Input;

  publicState?(state: State): unknown;

  publicMove?(state: State, move: Input): unknown;

  resultDelayMs?(state: State): number;

  playerCount?(config: unknown): number;

  step?(
    state: State,
    inputs: Map<string, Input>,
    dt: number,
  ): StepResult<State>;

  readonly tickRate?: number;
}
