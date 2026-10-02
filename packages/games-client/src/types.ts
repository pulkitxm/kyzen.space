import type { AvatarConfig, GameJson, MoveJson } from "@kyzen/shared/types";

export type GameClientProps = {
  userId: string | null;
  connected: boolean;
  game: GameJson;
  moves: MoveJson[];
  makeMove: (moveData: unknown) => void;
  onViewProfile?: (user: {
    username: string;
    displayName?: string | null;
    avatar?: AvatarConfig | null;
  }) => void;
};
