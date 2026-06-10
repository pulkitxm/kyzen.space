import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FPS } from "../src/lib/video";
import {
  TUTORIAL_MANIFEST,
  type TutorialManifestEntry,
  tutorialDurationInFrames,
} from "../src/tutorials/manifest";

function timestamp(frame: number): string {
  const totalSeconds = Math.floor(frame / FPS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function chaptersText(entry: TutorialManifestEntry): string {
  const lines: string[] = [];
  let frame = 0;
  for (const chapter of entry.chapters) {
    lines.push(`${timestamp(frame)} ${chapter.label}`);
    frame += chapter.durationInFrames;
  }
  return `${lines.join("\n")}\n`;
}

let failures = 0;
for (const entry of TUTORIAL_MANIFEST) {
  const dir = join("out", entry.id);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "tutorial.mp4");
  const seconds = tutorialDurationInFrames(entry) / FPS;
  console.log(`Rendering ${entry.id} (${seconds.toFixed(1)}s) -> ${target}`);
  const render = spawnSync("bunx", ["remotion", "render", entry.id, target], {
    stdio: "inherit",
  });
  if (render.status !== 0) {
    failures += 1;
    console.error(`Render failed for ${entry.id}`);
    continue;
  }
  writeFileSync(join(dir, "chapters.txt"), chaptersText(entry));
  console.log(`Wrote ${join(dir, "chapters.txt")}`);
}
if (failures > 0) {
  console.error(`${failures} tutorial(s) failed to export`);
  process.exit(1);
}
console.log(`Exported ${TUTORIAL_MANIFEST.length} tutorial(s) to out/`);
