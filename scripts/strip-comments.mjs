import { isUtf8 } from "node:buffer";
import { appendFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import ts from "typescript";
import { Parser } from "yaml";
import { trackedContent, trackedFiles } from "./tracked-files.mjs";

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
  postcss.parse(text).walkComments((comment) => {
    const pos = comment.source.start.offset;
    const end = comment.source.end.offset + 1;
    if (text.slice(pos, end).startsWith("/*!")) kept++;
    else remove.push({ pos, end });
  });
  return { remove, kept };
}

function jsoncComments(text) {
  const remove = [];
  let i = 0;
  const n = text.length;
  let str = false;
  while (i < n) {
    const c = text[i];
    if (str) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') str = false;
      i++;
      continue;
    }
    if (c === '"') {
      str = true;
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const start = i;
      let j = i + 2;
      while (j < n && !(text[j] === "*" && text[j + 1] === "/")) j++;
      const end = Math.min(n, j + 2);
      remove.push({ pos: start, end });
      i = end;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const start = i;
      let j = i + 2;
      while (j < n && text[j] !== "\n") j++;
      remove.push({ pos: start, end: j });
      i = j;
      continue;
    }
    i++;
  }
  return { remove, kept: 0 };
}

function hashComments(text) {
  const remove = [];
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote[0] !== "'") i++;
      else if (text.startsWith(quote, i)) {
        i += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = text.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += quote.length - 1;
    } else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      if (!(i === 0 && text.startsWith("#!")))
        remove.push({ pos: i, end: stop });
      i = stop - 1;
    } else if (c === "\\") i++;
  }
  return { remove, kept: 0 };
}

function yamlComments(text) {
  const remove = [];
  let kept = 0;
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "comment") {
      if (/^#\s*(yaml-language-server|yamllint)\b/.test(node.source)) kept++;
      else
        remove.push({
          pos: node.offset,
          end: node.offset + node.source.length,
        });
    }
    if (node.key?.source && node.value?.type === "block-scalar") {
      const value = node.value;
      const last = value.props[value.props.length - 1];
      const offset = last.offset + last.source.length;
      const comments =
        node.key.source === "script"
          ? tsComments("embedded.js", value.source)
          : node.key.source === "run"
            ? hashComments(value.source)
            : { remove: [], kept: 0 };
      kept += comments.kept;
      remove.push(
        ...comments.remove.map((r) => ({
          pos: offset + r.pos,
          end: offset + r.end,
        })),
      );
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  for (const token of new Parser().parse(text)) visit(token);
  return { remove, kept };
}

function sqlComments(text) {
  const remove = [];
  let kept = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const quote = c;
      while (++i < text.length) {
        if (text[i] === "\\" && quote === "'") i++;
        else if (text[i] === quote) {
          if (text[i + 1] === quote) i++;
          else break;
        }
      }
    } else if (
      c === "$" &&
      /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(text.slice(i))
    ) {
      const tag = text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)[0];
      const end = text.indexOf(tag, i + tag.length);
      i = end === -1 ? text.length : end + tag.length - 1;
    } else if (text.startsWith("--", i)) {
      const newline = text.indexOf("\n", i);
      const end = newline === -1 ? text.length : newline;
      if (text.slice(i, end).trim() === "--> statement-breakpoint") kept++;
      else remove.push({ pos: i, end });
      i = end - 1;
    } else if (text.startsWith("/*", i)) {
      const pos = i;
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (text.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      remove.push({ pos, end: i });
      i--;
    }
  }
  return { remove, kept };
}

function markupComments(text) {
  return {
    remove: [...text.matchAll(/<!--.*?(?:-->|$)/gs)].map((match) => ({
      pos: match.index,
      end: match.index + match[0].length,
    })),
    kept: 0,
  };
}

function comments(file, text) {
  if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) return tsComments(file, text);
  if (/\.css$/.test(file)) return cssComments(text);
  if (/\.(?:jsonc?|lock)$/.test(file)) return jsoncComments(text);
  if (/\.ya?ml$/.test(file)) return yamlComments(text);
  if (/\.sql$/.test(file)) return sqlComments(text);
  if (/\.(?:md|mdx|html|xml|svg)$/.test(file)) return markupComments(text);
  if (
    /\.(?:toml|sh|bash|zsh|py)$/.test(file) ||
    /(?:^|\/)(?:Makefile|Dockerfile|\.gitignore|\.env(?:\.[^/]+)?)$/.test(file)
  )
    return hashComments(text);
  return { remove: [], kept: 0 };
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
    if (
      r.start > 0 &&
      r.end < text.length &&
      !/\s/.test(text[r.start - 1]) &&
      !/\s/.test(text[r.end])
    )
      out += " ";
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

function buildSummary(findings, { totalRemoved, changedFiles, totalKept }) {
  const server = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const fileCell = (f, line) => {
    if (!repo || !sha) return `\`${f}\``;
    const href = `${server}/${repo}/blob/${sha}/${f.split("/").map(encodeURIComponent).join("/")}#L${line}`;
    return `[\`${f}\`](${href})`;
  };
  const codeCell = (s) =>
    s
      .replace(/[\\|]/g, "\\$&")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const rows = findings
    .map(
      (x) =>
        `| ${fileCell(x.file, x.line)} | ${x.line} | <code>${codeCell(x.text)}</code> |`,
    )
    .join("\n");
  return [
    `## ❌ ${totalRemoved} disallowed code comment${totalRemoved === 1 ? "" : "s"}`,
    "",
    `Comments are not allowed in code - found in **${changedFiles}** file${changedFiles === 1 ? "" : "s"} (**${totalKept}** functional directive${totalKept === 1 ? "" : "s"} like \`biome-ignore\` were ignored). Remove them locally with:`,
    "",
    "```bash",
    "bun run strip-comments",
    "```",
    "",
    "| File | Line | Comment |",
    "| --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function reportGithub(findings, stats) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const escData = (s) =>
    s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escProp = (s) => escData(s).replace(/,/g, "%2C").replace(/:/g, "%3A");
  for (const x of findings) {
    console.log(
      `::error file=${escProp(x.file)},line=${x.line},title=Disallowed comment::${escData(x.text)}`,
    );
  }
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const md = findings.length
    ? buildSummary(findings, stats)
    : "## ✅ No disallowed code comments\n\nEvery tracked file is comment-free (functional directives ignored).\n";
  appendFileSync(out, `${md}\n`);
}

const files = trackedFiles().filter((file) => file.mode !== "120000");

let changedFiles = 0;
let totalRemoved = 0;
let totalKept = 0;
const findings = [];

for (const file of files) {
  const f = file.path;
  const content = trackedContent(file);
  if (content.includes(0) || !isUtf8(content)) continue;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  const ext = f.slice(f.lastIndexOf("."));
  const { remove, kept } = comments(f, text);
  totalKept += kept;
  if (remove.length === 0) continue;
  changedFiles++;
  totalRemoved += remove.length;
  if (CHECK) {
    for (const r of remove)
      findings.push({
        file: f,
        line: lineOf(text, r.pos),
        text: snippet(text, r),
      });
    continue;
  }
  let out = build(text, remove);
  if (ext === ".css") out = tidyCss(out);
  if (out !== text) writeFileSync(f, out);
}

if (CHECK) {
  for (const x of findings) console.log(`${x.file}:${x.line}: ${x.text}`);
  reportGithub(findings, { totalRemoved, changedFiles, totalKept });
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
