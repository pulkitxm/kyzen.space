import { execFileSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";

export function trackedFiles() {
  return execFileSync("git", ["ls-files", "--stage", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("\t");
      const [mode, , stage] = entry.slice(0, separator).split(" ");
      if (stage !== "0")
        throw new Error("Resolve unmerged files before checking.");
      return { path: entry.slice(separator + 1), mode };
    });
}

export function trackedContent(file) {
  return file.mode === "120000"
    ? Buffer.from(readlinkSync(file.path))
    : readFileSync(file.path);
}
