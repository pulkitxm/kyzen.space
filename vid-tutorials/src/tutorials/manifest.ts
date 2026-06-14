import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameType } from "@kyzen/shared/types";
import type { TutorialChapter } from "../lib/video";
import { TIC_TAC_TOE_CHAPTERS } from "./tic-tac-toe/timeline";

export type TutorialManifestEntry = {
  id: GameType;
  title: string;
  chapters: readonly TutorialChapter[];
};

export const TUTORIAL_MANIFEST: readonly TutorialManifestEntry[] = [
  {
    id: TIC_TAC_TOE,
    title: "How to play Tic-tac-toe",
    chapters: TIC_TAC_TOE_CHAPTERS,
  },
];

export function tutorialDurationInFrames(entry: TutorialManifestEntry): number {
  return entry.chapters.reduce(
    (total, chapter) => total + chapter.durationInFrames,
    0,
  );
}
