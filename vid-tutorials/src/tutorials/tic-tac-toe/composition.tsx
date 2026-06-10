import "./styles.css";
import { AbsoluteFill, interpolate, Series, useCurrentFrame } from "remotion";
import { SceneShell } from "../../lib/scene-shell";
import { TutorialMusic } from "../../lib/tutorial-music";
import { PatternBackdrop } from "../../theme/pattern-backdrop";
import { ThemeRoot } from "../../theme/theme-root";
import { DrawScene } from "./scenes/draw";
import { GoalScene } from "./scenes/goal";
import { OutroScene } from "./scenes/outro";
import { SetupScene } from "./scenes/setup";
import { TitleScene } from "./scenes/title";
import { TurnsScene } from "./scenes/turns";
import { WinningScene } from "./scenes/winning";
import { SCENE_FRAMES, TIC_TAC_TOE_TUTORIAL_FRAMES } from "./timeline";

function Backdrop() {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, TIC_TAC_TOE_TUTORIAL_FRAMES], [1, 1.08]);
  return (
    <AbsoluteFill>
      <PatternBackdrop style={{ transform: `scale(${drift})` }} />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 32%, var(--page-ambient), transparent 70%)",
        }}
      />
    </AbsoluteFill>
  );
}

const SCENES = [
  { key: "title", frames: SCENE_FRAMES.title, content: <TitleScene /> },
  { key: "goal", frames: SCENE_FRAMES.goal, content: <GoalScene /> },
  { key: "setup", frames: SCENE_FRAMES.setup, content: <SetupScene /> },
  { key: "turns", frames: SCENE_FRAMES.turns, content: <TurnsScene /> },
  { key: "winning", frames: SCENE_FRAMES.winning, content: <WinningScene /> },
  { key: "draw", frames: SCENE_FRAMES.draw, content: <DrawScene /> },
];

export function TicTacToeTutorial() {
  return (
    <ThemeRoot>
      <TutorialMusic src="sounds/tic-tac-toe-bg.ogg" />
      <Backdrop />
      <Series>
        {SCENES.map((scene) => (
          <Series.Sequence key={scene.key} durationInFrames={scene.frames}>
            <SceneShell duration={scene.frames}>{scene.content}</SceneShell>
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={SCENE_FRAMES.outro}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </ThemeRoot>
  );
}
