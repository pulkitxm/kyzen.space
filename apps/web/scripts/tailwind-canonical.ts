import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "tailwindcss";
import ts from "typescript";

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

export type CanonicalEdit = {
  start: number;
  end: number;
  from: string;
  to: string;
};

const ROOT_FONT_SIZE = 16;
const CLASS_ATTRIBUTES = new Set(["class", "className"]);
const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  ".js": ts.ScriptKind.JSX,
  ".jsx": ts.ScriptKind.JSX,
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
};
const requireFromHere = createRequire(import.meta.url);

function stylesheetPath(id: string, base: string): string {
  if (id.startsWith(".") || isAbsolute(id)) return resolve(base, id);
  const target = id === "tailwindcss" ? "tailwindcss/index.css" : id;
  return requireFromHere.resolve(target, { paths: [base] });
}

export async function loadDesignSystem(cssPath: string): Promise<DesignSystem> {
  const file = resolve(cssPath);
  return __unstable__loadDesignSystem(readFileSync(file, "utf8"), {
    base: dirname(file),
    loadStylesheet: async (id, base) => {
      const path = stylesheetPath(id, base);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
}

function literalRange(node: ts.Node, source: ts.SourceFile) {
  const start = node.getStart(source);
  const end = node.getEnd();
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { start: start + 1, end: end - 1 };
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node))
    return { start: start + 1, end: end - 2 };
  if (ts.isTemplateTail(node)) return { start: start + 1, end: end - 1 };
  return null;
}

function classRanges(text: string, file: string) {
  const kind = SCRIPT_KINDS[extname(file).toLowerCase()];
  if (kind === undefined) return [];
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const ranges: { start: number; end: number }[] = [];
  const collect = (node: ts.Node) => {
    const range = literalRange(node, source);
    if (range) ranges.push(range);
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      CLASS_ATTRIBUTES.has(node.name.getText(source)) &&
      node.initializer
    ) {
      collect(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ranges;
}

export function canonicalEdits(
  text: string,
  file: string,
  designSystem: DesignSystem,
): CanonicalEdit[] {
  const edits: CanonicalEdit[] = [];
  for (const range of classRanges(text, file)) {
    const value = text.slice(range.start, range.end);
    for (const match of value.matchAll(/\S+/g)) {
      const from = match[0];
      const [to] = designSystem.canonicalizeCandidates([from], {
        rem: ROOT_FONT_SIZE,
      });
      if (!to || to === from) continue;
      const start = range.start + match.index;
      edits.push({ start, end: start + from.length, from, to });
    }
  }
  return edits;
}

export function applyEdits(text: string, edits: CanonicalEdit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (output, edit) =>
        output.slice(0, edit.start) + edit.to + output.slice(edit.end),
      text,
    );
}

function lineAndColumn(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return `${before.length}:${(before.at(-1)?.length ?? 0) + 1}`;
}

function expandPattern(pattern: string): string[] {
  const parts = pattern.split("/");
  const firstGlob = parts.findIndex((part) => /[*?[{]/.test(part));
  const base = parts.slice(0, firstGlob).join("/") || ".";
  const glob = new Bun.Glob(parts.slice(firstGlob).join("/"));
  return [...glob.scanSync({ cwd: base, onlyFiles: true })].map((file) =>
    resolve(base, file),
  );
}

async function main(args: string[]) {
  const check = args.includes("--check");
  const cssIndex = args.indexOf("--css");
  const cssPath = cssIndex >= 0 ? args[cssIndex + 1] : undefined;
  if (!cssPath)
    throw new Error("Pass the Tailwind entry stylesheet with --css");
  const patterns = args.filter(
    (arg, index) => !arg.startsWith("--") && index !== cssIndex + 1,
  );
  const designSystem = await loadDesignSystem(cssPath);
  const files = [...new Set(patterns.flatMap(expandPattern))].sort();
  let found = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const edits = canonicalEdits(text, file, designSystem);
    if (edits.length === 0) continue;
    found += edits.length;
    if (check) {
      for (const edit of edits)
        console.error(
          `${relative(process.cwd(), file)}:${lineAndColumn(text, edit.start)} ${edit.from} -> ${edit.to}`,
        );
    } else {
      writeFileSync(file, applyEdits(text, edits));
    }
  }
  const verb = check ? "non-canonical" : "rewritten";
  console.info(`${files.length} files checked, ${found} ${verb} classes`);
  if (check && found > 0) process.exit(1);
}

if (import.meta.main) await main(process.argv.slice(2));
