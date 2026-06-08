import type { AvatarConfig } from "@gamelobby/shared/types";
import type { Socket } from "socket.io-client";

export type GameClientProps = {
  gameId: string;
  userId: string | null;
  socket: Socket | null;
  connected: boolean;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: {
      userId: string;
      username: string;
      role: string;
      avatar?: AvatarConfig | null;
    }[];
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
  onViewProfile?: (user: {
    username: string;
    displayName?: string | null;
    avatar?: AvatarConfig | null;
  }) => void;
};
