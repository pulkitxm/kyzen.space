import { trackedContent, trackedFiles } from "./tracked-files.mjs";

let violations = 0;
for (const file of trackedFiles()) {
  const problems = [];
  const content = trackedContent(file).toString("utf8");
  if (/^(?:<<<<<<< |=======\s*$|>>>>>>> )/m.test(content))
    problems.push("unresolved merge conflict");
  if (
    /(?:^|\/)\.env(?:\.|$)/.test(file.path) &&
    file.path !== ".env.example" &&
    !(
      file.path === "apps/web/.env" &&
      file.mode === "120000" &&
      content === "../../.env"
    )
  )
    problems.push("tracked environment file");
  if (
    /(?:^|\/)(?:\.husky|\.githooks|hooks)\//.test(file.path) ||
    /(?:^|\/)(?:\.?lefthook\.[^/]+|\.pre-commit-config\.[^/]+|\.lintstagedrc[^/]*)$/.test(
      file.path,
    )
  )
    problems.push("local hook configuration");
  if (/(?:^|\/)package\.json$/.test(file.path)) {
    const pkg = JSON.parse(content);
    for (const name of Object.keys(pkg.scripts ?? {})) {
      if (
        /^(?:preinstall|install|postinstall|prepare|prepublish|prepublishOnly|precommit|pre-commit|prepush|pre-push)$/.test(
          name,
        )
      )
        problems.push(`automatic lifecycle or hook script: ${name}`);
    }
    for (const name of [
      "husky",
      "lefthook",
      "simple-git-hooks",
      "pre-commit",
      "lint-staged",
    ]) {
      if (pkg.dependencies?.[name] || pkg.devDependencies?.[name] || pkg[name])
        problems.push(`local hook tooling: ${name}`);
    }
  }
  for (const problem of problems) {
    violations++;
    console.error(`${JSON.stringify(file.path)}: ${problem}`);
  }
}
if (violations) process.exit(1);
console.log(
  "Tracked files contain no local hooks, stray env files, or conflict markers.",
);
