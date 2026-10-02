import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let repo;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "repository-policy-"));
  execFileSync("git", ["init", "--quiet"], { cwd: repo });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function track(path, content) {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  execFileSync("git", ["add", "--force", "--", path], { cwd: repo });
}

function run(script, ...args) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(`../${script}.mjs`, import.meta.url)), ...args],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: "false" },
    },
  );
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("tracked comment enforcement", () => {
  test.each([
    ["source.ts", "const x = 1; // forbidden\n"],
    ["source.mts", "/* forbidden */ export {};\n"],
    ["source.cts", "// forbidden\nexport {};\n"],
    ["view.tsx", "const x = <div>{/* forbidden */}</div>;\n"],
    ["empty.js", "// forbidden\n"],
    ["style.css", ".x { /* forbidden */ color: red; }\n"],
    ["config.jsonc", '{ "x": 1 /* forbidden */ }\n'],
    ["config.yml", "title: user's choice # forbidden\n"],
    ["config.toml", 'value = "# data" # forbidden\n'],
    [".env.example", "KEY=value # forbidden\n"],
    [".gitignore", "# forbidden\nnode_modules/\n"],
    ["packages/database/drizzle/fixture.sql", "SELECT 1; -- forbidden\n"],
    ["image.svg", "<svg><!-- forbidden --></svg>\n"],
    ["doc.md", "# Heading\n<!-- forbidden -->\n"],
    ["script.sh", "#!/bin/sh\necho '# data' # forbidden\n"],
    ["workflow.yml", "steps:\n  - run: |\n      # forbidden\n      echo ok\n"],
    [
      "workflow.yml",
      "steps:\n  - with:\n      script: |\n        const x = 1; // forbidden\n",
    ],
    ["space name\nline.ts", "// forbidden\n"],
  ])("rejects comments in %s without rewriting", (path, source) => {
    track(path, source);
    const result = run("strip-comments", "--check");
    expect(result.status).toBe(1);
    expect(result.output).toContain("disallowed comment");
    expect(readFileSync(join(repo, path), "utf8")).toBe(source);
    expect(run("strip-comments").status).toBe(0);
    expect(run("strip-comments", "--check").status).toBe(0);
  });

  test("preserves strings, templates, regex, JSX text and compiler directives", () => {
    track(
      "source.tsx",
      [
        'const url = "https://example.test/path#fragment";',
        `const template = \`literal /* data */ \${1 /* forbidden */}\`;`,
        "const re = /https?:\\/\\//;",
        "const jsx = <div>literal // data</div>;",
        "// @ts-expect-error intentional invalid assignment",
        "const n: number = url;",
        "/*! retained license */",
      ].join("\n"),
    );
    expect(run("strip-comments", "--check").status).toBe(1);
    expect(run("strip-comments").status).toBe(0);
    const result = readFileSync(join(repo, "source.tsx"), "utf8");
    expect(result).toContain("literal /* data */");
    expect(result).toContain("literal // data");
    expect(result).toContain("@ts-expect-error");
    expect(result).toContain("retained license");
    expect(result).not.toContain("forbidden");
    expect(run("strip-comments", "--check").status).toBe(0);
  });

  test("preserves SQL strings and migration breakpoints while removing nested comments", () => {
    track(
      "migration.sql",
      "SELECT '-- data', $$/* data */$$;--> statement-breakpoint\nSELECT/* outer /* inner */ end */1;\n",
    );
    expect(run("strip-comments").status).toBe(0);
    const result = readFileSync(join(repo, "migration.sql"), "utf8");
    expect(result).toContain("SELECT 1;");
    expect(result).toContain("'-- data'");
    expect(result).toContain("$$/* data */$$");
    expect(result).toContain("--> statement-breakpoint");
    expect(run("strip-comments", "--check").status).toBe(0);
  });

  test("does not mistake TOML multiline strings or YAML block data for comments", () => {
    track("config.toml", 'value = """\n# data\n"""\n');
    track(
      "config.yml",
      "text: |\n  # data\nurl: https://example.test/#fragment\n",
    );
    expect(run("strip-comments", "--check").status).toBe(0);
  });

  test("does not concatenate tokens when removing inline comments", () => {
    track("source.ts", "const value = 1/* forbidden */+2;\n");
    expect(run("strip-comments").status).toBe(0);
    expect(readFileSync(join(repo, "source.ts"), "utf8")).toContain("1 +2");
  });

  test("ignores untracked data and never follows a tracked symlink", () => {
    writeFileSync(join(repo, "untracked.ts"), "// private data\n");
    symlinkSync("untracked.ts", join(repo, "link.ts"));
    execFileSync("git", ["add", "link.ts"], { cwd: repo });
    expect(run("strip-comments", "--check").status).toBe(0);
    expect(readFileSync(join(repo, "untracked.ts"), "utf8")).toBe(
      "// private data\n",
    );
  });

  test("fails when a tracked source file is missing", () => {
    track("missing.ts", "export {};\n");
    rmSync(join(repo, "missing.ts"));
    expect(run("strip-comments", "--check").status).not.toBe(0);
  });
});

describe("em dash enforcement", () => {
  test.each([
    "doc.md",
    "bun.lock",
    "binary.dat",
    "space name\nline.txt",
  ])("rejects U+2014 in tracked %s", (path) => {
    track(path, `data\u2014value`);
    expect(run("check-em-dashes").status).toBe(1);
  });
  test("checks a symlink's target name without following it", () => {
    symlinkSync("missing\u2014target", join(repo, "link"));
    execFileSync("git", ["add", "link"], { cwd: repo });
    expect(run("check-em-dashes").status).toBe(1);
  });
  test("ignores untracked files", () => {
    writeFileSync(join(repo, "local.txt"), "private\u2014data");
    track("tracked.txt", "normal text");
    expect(run("check-em-dashes").status).toBe(0);
  });
});

describe("repository hygiene", () => {
  test.each([
    [".husky/pre-commit", "exit 0"],
    ["lefthook.yml", "pre-commit: {}"],
    [".huskyrc.json", "{}"],
    [
      "package.json",
      '{"scripts":{"test":"bun test","pretest":"bun run check"}}',
    ],
    [".env.production", "KEY=synthetic"],
    ["apps/web/.env", "KEY=synthetic"],
    ["package.json", '{"scripts":{"prepare":"husky"}}'],
    ["package.json", '{"devDependencies":{"simple-git-hooks":"1.0.0"}}'],
    ["source.txt", "<<<<<<< branch\na\n=======\nb\n>>>>>>> main\n"],
  ])("rejects forbidden repository state in %s", (path, content) => {
    track(path, content);
    expect(run("check-repository").status).toBe(1);
  });
  test("allows a normal source folder for React hooks", () => {
    track("apps/web/hooks/use-example.ts", "export {};\n");
    expect(run("check-repository").status).toBe(0);
  });
  test("allows only the documented web env symlink and placeholder example", () => {
    track(".env.example", "KEY=synthetic");
    mkdirSync(join(repo, "apps/web"), { recursive: true });
    symlinkSync("../../.env", join(repo, "apps/web/.env"));
    execFileSync("git", ["add", "--force", "apps/web/.env"], { cwd: repo });
    expect(run("check-repository").status).toBe(0);
  });
});

describe("strict Biome enforcement", () => {
  test.each([
    ["apps/server/src/probe.ts", 'console.log("debug");\n'],
    ["packages/example/src/probe.ts", 'console.log("debug");\n'],
    ["probe.test.ts", 'test.only("focused", () => {});\n'],
    ["probe.test.ts", 'test.skip("disabled", () => {});\n'],
    ["probe.ts", "debugger;\n"],
    ["probe.ts", "export const value: any = 1;\n"],
    ["probe.ts", `export const value = "\${value}";\n`],
  ])("fails on forbidden source or warnings in %s", (path, source) => {
    track(
      "biome.json",
      readFileSync(new URL("../../biome.json", import.meta.url)),
    );
    track(path, source);
    track(".gitignore", "");
    const binary = fileURLToPath(
      new URL("../../node_modules/.bin/biome", import.meta.url),
    );
    const result = spawnSync(binary, ["ci", "--error-on-warnings", "."], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("lint/");
  });
});
