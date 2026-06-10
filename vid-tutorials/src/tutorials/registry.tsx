import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { GameType } from "@gamelobby/shared/types";
import type { FC } from "react";
import { TicTacToeTutorial } from "./tic-tac-toe/composition";
import { TIC_TAC_TOE_TUTORIAL_FRAMES } from "./tic-tac-toe/timeline";

export type TutorialEntry = {
  id: GameType;
  title: string;
  durationInFrames: number;
  component: FC;
};

export const TUTORIALS: TutorialEntry[] = [
  {
    id: TIC_TAC_TOE,
    title: "How to play Tic-tac-toe",
    durationInFrames: TIC_TAC_TOE_TUTORIAL_FRAMES,
    component: TicTacToeTutorial,
  },
];
