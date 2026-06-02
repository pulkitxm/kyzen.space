import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const args = process.argv.slice(2);
const CHECK = args.some(
  (a) => a === "--check" || a === "--dry-run" || a === "--dry",
);

function keep(raw) {
  const isLine = raw.startsWith("//");
  if (
    isLine &&
    raw.startsWith("///") &&
    /^<(reference|amd-)/.test(raw.slice(3).trim())
  ) {
    return true;
  }
  if (!isLine && raw.startsWith("/*!")) return true;
  const inner = isLine ? raw.replace(/^\/\/+/, "") : raw.slice(2, -2);
  const t = inner.trim().replace(/^\*+\s*/, "");

  if (/^@(ts-ignore|ts-expect-error|ts-nocheck|ts-check)\b/.test(t))
    return true;
  if (/^eslint-(disable|enable)(-next-line|-line)?\b/.test(t)) return true;
  if (/^biome-ignore\b/.test(t)) return true;
  if (/^prettier-ignore\b/.test(t)) return true;
  if (/^@(jsx|jsxImportSource|jsxRuntime|jsxFrag)\b/.test(t)) return true;
  if (/^#\s*source(MappingURL|URL)\b/.test(t)) return true;
  if (/^@vite-ignore\b/.test(t)) return true;
  if (/^[#@]__(PURE|NO_SIDE_EFFECTS)__/.test(t)) return true;
  if (/^(istanbul|c8|v8)\s+ignore\b/.test(t)) return true;
  if (/^@(license|preserve)\b/.test(t)) return true;
  if (/webpack(ChunkName|Mode|Prefetch|Preload|Include|Exclude|Ignore)/.test(t))
    return true;

  if (!isLine && /^(eslint-env|eslint\s|globals?\s|exported\b)/.test(t))
    return true;

  return false;
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(c|m)?ts$/.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function tsComments(file, text) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const seen = new Set();
  const found = [];
  const jsxSpans = [];
  const add = (ranges) => {
    for (const r of ranges || []) {
      const key = `${r.pos}:${r.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ pos: r.pos, end: r.end });
    }
  };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxSpans.push([node.getFullStart(), node.getEnd()]);
      return;
    }
    const children = node.getChildren(sf);
    if (children.length === 0) {
      add(ts.getLeadingCommentRanges(text, node.getFullStart()));
      add(ts.getTrailingCommentRanges(text, node.getEnd()));
      return;
    }
    for (const c of children) visit(c);
  };
  visit(sf);

  const inJsxText = (r) => jsxSpans.some(([s, e]) => r.pos < e && r.end > s);
  const remove = [];
  let kept = 0;
  for (const r of found) {
    if (inJsxText(r)) continue;
    if (keep(text.slice(r.pos, r.end))) kept++;
    else remove.push(r);
  }
  return { remove, kept };
}

function cssComments(text) {
  const remove = [];
  let kept = 0;
  let i = 0;
  const n = text.length;
  let str = null;
  while (i < n) {
    const c = text[i];
    if (str) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      str = c;
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const start = i;
      let j = i + 2;
      while (j < n && !(text[j] === "*" && text[j + 1] === "/")) j++;
      const end = Math.min(n, j + 2);
      if (text.slice(start, end).startsWith("/*!")) kept++;
      else remove.push({ pos: start, end });
      i = end;
      continue;
    }
    i++;
  }
  return { remove, kept };
}

function expand(text, pos, end) {
  let ls = pos;
  while (ls > 0 && text[ls - 1] !== "\n") ls--;
  let le = end;
  while (le < text.length && text[le] !== "\n") le++;
  if (
    /^[ \t]*$/.test(text.slice(ls, pos)) &&
    /^[ \t]*$/.test(text.slice(end, le))
  ) {
    return { start: ls, end: le < text.length ? le + 1 : le };
  }
  return { start: pos, end };
}

function build(text, ranges) {
  const exp = ranges.map((r) => expand(text, r.pos, r.end));
  exp.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const r of exp) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  let out = "";
  let cursor = 0;
  for (const r of merged) {
    out += text.slice(cursor, r.start);
    cursor = r.end;
  }
  return out + text.slice(cursor);
}

function tidyCss(s) {
  return s
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "\n");
}

function lineOf(text, pos) {
  let line = 1;
  for (let i = 0; i < pos; i++) if (text[i] === "\n") line++;
  return line;
}

function snippet(text, r) {
  const first = text.slice(r.pos, r.end).split("\n")[0].trim();
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

const files = execSync(
  "git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.css'",
  {
    encoding: "utf8",
  },
)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => !/(^|\/)next-env\.d\.ts$/.test(f));

let changedFiles = 0;
let totalRemoved = 0;
let totalKept = 0;
const findings = [];

for (const f of files) {
  const text = readFileSync(f, "utf8");
  const isCss = f.endsWith(".css");
  const { remove, kept } = isCss ? cssComments(text) : tsComments(f, text);
  totalKept += kept;
  if (remove.length === 0) continue;
  changedFiles++;
  totalRemoved += remove.length;
  if (CHECK) {
    for (const r of remove)
      findings.push(`${f}:${lineOf(text, r.pos)}: ${snippet(text, r)}`);
    continue;
  }
  let out = build(text, remove);
  if (isCss) out = tidyCss(out);
  if (out !== text) writeFileSync(f, out);
}

if (CHECK) {
  for (const line of findings) console.log(line);
  console.log(
    `\n${totalRemoved} disallowed comment(s) in ${changedFiles} file(s) (${totalKept} directive(s) ignored).`,
  );
  if (totalRemoved > 0) {
    console.log(
      "Code comments are not allowed. Run `bun run strip-comments` to remove them.",
    );
    process.exit(1);
  }
  console.log("OK: no disallowed comments found.");
} else {
  console.log(`scanned ${files.length} files`);
  console.log(`changed: ${changedFiles} files`);
  console.log(`comments removed: ${totalRemoved}`);
  console.log(`directives/license kept: ${totalKept}`);
  console.log(
    "\nnext: run `bun run fix` to format, then `bun run type-check`.",
  );
}
