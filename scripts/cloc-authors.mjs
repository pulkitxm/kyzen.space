import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  let ref = "HEAD";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--branch" || a === "-b") {
      ref = argv[++i] ?? ref;
    } else if (a.startsWith("--branch=")) {
      ref = a.slice("--branch=".length);
    } else if (!a.startsWith("-")) {
      ref = a;
    }
  }
  return ref;
}

const requestedRef = parseArgs(process.argv.slice(2));

const EXCLUDE_NAME =
  /bun\.lock|package-lock\.json|\.snap$|_snapshot\.json$|_journal\.json$/;
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|pdf|mp[34]|wav|ogg|webm|mov|zip|gz|tar|tgz|br|wasm|node)$/i;

function git(cmdArgs) {
  return execFileSync("git", cmdArgs, {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
}

function tryGit(cmdArgs) {
  try {
    return git(cmdArgs);
  } catch {
    return null;
  }
}

function resolveRef(input) {
  const remotes = (tryGit(["remote"]) ?? "").split("\n").filter(Boolean);
  const candidates = [input, ...remotes.map((r) => `${r}/${input}`)];
  for (const c of candidates) {
    if (tryGit(["rev-parse", "--verify", "--quiet", `${c}^{commit}`]) != null) {
      return c;
    }
  }
  return null;
}

function listFiles(at) {
  return git(["ls-tree", "-r", "--name-only", at])
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDE_NAME.test(f.split("/").pop()))
    .filter((f) => !BINARY_EXT.test(f));
}

function blameFile(at, file) {
  const out = tryGit(["blame", "--line-porcelain", "-w", at, "--", file]);
  if (out == null) return [];
  const lines = [];
  let name = "";
  let email = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("author-mail ")) {
      email = line.slice("author-mail ".length).replace(/^<|>$/g, "");
    } else if (line.startsWith("author ")) {
      name = line.slice("author ".length);
    } else if (line.startsWith("\t")) {
      if (line.slice(1).trim() !== "") lines.push({ name, email });
    }
  }
  return lines;
}

const ref = resolveRef(requestedRef);
if (ref == null) {
  console.error(
    `No ref matching "${requestedRef}" (tried local and remote-tracking branches).\nFetch it first, e.g.: git fetch origin ${requestedRef}`,
  );
  process.exit(1);
}

const files = listFiles(ref);

const byEmail = new Map();
let total = 0;

for (const file of files) {
  for (const { name, email } of blameFile(ref, file)) {
    let entry = byEmail.get(email);
    if (!entry) {
      entry = { name, email, lines: 0, files: new Set() };
      byEmail.set(email, entry);
    }
    entry.lines += 1;
    entry.files.add(file);
    total += 1;
  }
}

const rows = [...byEmail.values()]
  .map((e) => ({
    name: e.name,
    email: e.email,
    lines: e.lines,
    files: e.files.size,
    share: total === 0 ? 0 : (e.lines / total) * 100,
  }))
  .sort((a, b) => b.lines - a.lines);

console.log(`Contributor LOC share — ${ref}  (git blame, non-blank lines)\n`);
const nameW = Math.max(6, ...rows.map((r) => r.name.length));
const linesW = Math.max(5, ...rows.map((r) => r.lines.toLocaleString().length));
const head = `${"Author".padEnd(nameW)}  ${"Lines".padStart(linesW)}  Files   Share`;
console.log(head);
console.log("-".repeat(head.length));
for (const r of rows) {
  console.log(
    `${r.name.padEnd(nameW)}  ${r.lines.toLocaleString().padStart(linesW)}  ${String(r.files).padStart(5)}  ${`${r.share.toFixed(1)}%`.padStart(6)}`,
  );
}
console.log("-".repeat(head.length));
console.log(
  `${"Total".padEnd(nameW)}  ${total.toLocaleString().padStart(linesW)}  ${String(files.length).padStart(5)}  ${"100%".padStart(6)}`,
);
