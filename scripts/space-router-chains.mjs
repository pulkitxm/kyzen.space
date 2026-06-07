import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";
import ts from "typescript";

const args = process.argv.slice(2);
const CHECK = args.some((a) => a === "--check" || a === "--dry-run");
const patterns = args.filter((a) => !a.startsWith("--"));
const DEFAULT_GLOB = "apps/server/src/api/routes/**/*.ts";
const globs = patterns.length > 0 ? patterns : [DEFAULT_GLOB];

function chainMemberLines(source) {
  const sf = ts.createSourceFile(
    "file.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const lines = new Set();

  function recordChain(newExpr) {
    let access = newExpr.parent;
    let isFirstMember = true;
    while (
      access &&
      ts.isPropertyAccessExpression(access) &&
      access.parent &&
      ts.isCallExpression(access.parent)
    ) {
      if (!isFirstMember) {
        const at = sf.getLineAndCharacterOfPosition(access.name.getStart(sf));
        lines.add(at.line);
      }
      isFirstMember = false;
      access = access.parent.parent;
    }
  }

  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Hono"
    ) {
      recordChain(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return lines;
}

function spaceChains(source) {
  const targets = chainMemberLines(source);
  if (targets.size === 0) return source;
  const lines = source.split("\n");
  const descending = [...targets].sort((a, b) => b - a);
  for (const index of descending) {
    const previous = lines[index - 1];
    if (previous !== undefined && previous.trim() !== "") {
      lines.splice(index, 0, "");
    }
  }
  return lines.join("\n");
}

const touched = [];
for (const pattern of globs) {
  for (const file of new Glob(pattern).scanSync(".")) {
    const original = readFileSync(file, "utf8");
    const updated = spaceChains(original);
    if (updated !== original) {
      touched.push(file);
      if (!CHECK) writeFileSync(file, updated);
    }
  }
}

const verb = CHECK ? "would space" : "spaced";
for (const file of touched) console.log(`${verb}: ${file}`);
console.log(`${touched.length} file(s) ${CHECK ? "would change" : "updated"}`);
if (CHECK && touched.length > 0) process.exit(1);
