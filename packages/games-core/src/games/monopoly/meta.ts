import { MONOPOLY } from "@gamelobby/shared/constants";
import type { GameMeta } from "@gamelobby/shared/types";

export const monopolyMeta: GameMeta = {
  type: MONOPOLY,
  name: "Monopoly",
  description:
    "Buy properties, build houses, and bankrupt your opponents in this classic board game.",
  categoryId: "board-classics",
  coverImage: "/games/monopoly-cover.png",
  layoutWidth: "max-w-6xl",
};
