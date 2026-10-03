import { CAR_FOOTBALL, GAME_CATEGORIES } from "@kyzen/shared/constants";
import type { GameMeta } from "@kyzen/shared/types";

export const carFootballMeta: GameMeta = {
  type: CAR_FOOTBALL,
  name: "Turbo Pitch",
  description:
    "Drive, jump, boost, and score in a four-player car football arena.",
  categoryId: GAME_CATEGORIES.ARENA.id,
  howToPlay: [
    "Four players join a room, two on blue and two on orange.",
    "Drive with W and S, steer with A and D, jump with Space, and boost with Shift.",
    "Push the ball into the opposing goal. The higher score after three minutes wins.",
    "A tied match goes to sudden-death overtime.",
  ],
};
