import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { FC } from "react";
import {
  TUTORIAL_MANIFEST,
  type TutorialManifestEntry,
  tutorialDurationInFrames,
} from "./manifest";
import { TicTacToeTutorial } from "./tic-tac-toe/composition";

export type TutorialEntry = TutorialManifestEntry & {
  durationInFrames: number;
  component: FC;
};

const COMPONENTS: Partial<Record<string, FC>> = {
  [TIC_TAC_TOE]: TicTacToeTutorial,
};

export const TUTORIALS: TutorialEntry[] = TUTORIAL_MANIFEST.map((entry) => {
  const component = COMPONENTS[entry.id];
  if (!component) {
    throw new Error(`Tutorial "${entry.id}" has no registered component`);
  }
  return {
    ...entry,
    durationInFrames: tutorialDurationInFrames(entry),
    component,
  };
});
