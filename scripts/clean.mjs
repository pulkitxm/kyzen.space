import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SKIP_DIRS = new Set([".git", ".claude"]);
const TARGET_DIRS = new Set(["node_modules", ".next"]);

let removed = 0;

function remove(path) {
  console.log(`  \x1b[31m✗\x1b[0m ${relative(root, path) || "."}`);
  rmSync(path, { recursive: true, force: true });
  removed += 1;
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (TARGET_DIRS.has(entry.name)) {
        remove(full);
        continue;
      }
      if (entry.name === ".turbo") {
        const cache = join(full, "cache");
        if (existsSync(cache)) remove(cache);
        continue;
      }
      walk(full);
    }
  }
}

console.log("Cleaning dependencies and build caches…");
walk(root);
console.log(
  removed
    ? `\nRemoved ${removed} item${removed === 1 ? "" : "s"}.`
    : "Nothing to clean.",
);
