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

function buildCommitAuthors(at) {
  const RS = "\x1e";
  const US = "\x1f";
  const out = git(["log", at, "--format=%H%x1f%an%x1f%ae%x1f%B%x1e"]);
  const coAuthor = /^[ \t]*Co-authored-by:[ \t]*(.+?)[ \t]*<([^>]+)>[ \t]*$/gim;
  const map = new Map();
  for (const record of out.split(RS)) {
    const [sha, name, email, body = ""] = record.replace(/^\n+/, "").split(US);
    if (!sha) continue;
    const authors = [];
    const seen = new Set();
    const add = (n, e) => {
      const key = e.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      authors.push({ name: n, email: e });
    };
    add(name, email);
    for (const m of body.matchAll(coAuthor)) add(m[1].trim(), m[2].trim());
    map.set(sha, authors);
  }
  return map;
}

function blameFile(at, file) {
  const out = tryGit(["blame", "--line-porcelain", "-w", at, "--", file]);
  if (out == null) return [];
  const lines = [];
  let sha = "";
  let name = "";
  let email = "";
  for (const line of out.split("\n")) {
    if (/^[0-9a-f]{40} \d+ \d+/.test(line)) {
      sha = line.slice(0, 40);
    } else if (line.startsWith("author-mail ")) {
      email = line.slice("author-mail ".length).replace(/^<|>$/g, "");
    } else if (line.startsWith("author ")) {
      name = line.slice("author ".length);
    } else if (line.startsWith("\t")) {
      if (line.slice(1).trim() !== "") lines.push({ sha, name, email });
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

const commitAuthors = buildCommitAuthors(ref);
const files = listFiles(ref);

const byEmail = new Map();
let total = 0;

for (const file of files) {
  for (const { sha, name, email } of blameFile(ref, file)) {
    const authors = commitAuthors.get(sha) ?? [{ name, email }];
    const weight = 1 / authors.length;
    for (const author of authors) {
      let entry = byEmail.get(author.email);
      if (!entry) {
        entry = {
          name: author.name,
          email: author.email,
          lines: 0,
          files: new Set(),
        };
        byEmail.set(author.email, entry);
      }
      entry.lines += weight;
      entry.files.add(file);
    }
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

console.log(
  `Contributor LOC share - ${ref}  (git blame, co-authors split evenly, non-blank lines)\n`,
);
const fmtLines = (n) => Math.round(n).toLocaleString();
const nameW = Math.max(6, ...rows.map((r) => r.name.length));
const linesW = Math.max(
  5,
  fmtLines(total).length,
  ...rows.map((r) => fmtLines(r.lines).length),
);
const head = `${"Author".padEnd(nameW)}  ${"Lines".padStart(linesW)}  Files   Share`;
console.log(head);
console.log("-".repeat(head.length));
for (const r of rows) {
  console.log(
    `${r.name.padEnd(nameW)}  ${fmtLines(r.lines).padStart(linesW)}  ${String(r.files).padStart(5)}  ${`${r.share.toFixed(1)}%`.padStart(6)}`,
  );
}
console.log("-".repeat(head.length));
console.log(
  `${"Total".padEnd(nameW)}  ${total.toLocaleString().padStart(linesW)}  ${String(files.length).padStart(5)}  ${"100%".padStart(6)}`,
);
