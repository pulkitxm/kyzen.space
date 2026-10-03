import { beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  applyEdits,
  canonicalEdits,
  loadDesignSystem,
} from "../scripts/tailwind-canonical";

const CSS = join(import.meta.dir, "..", "app", "globals.css");

let designSystem: Awaited<ReturnType<typeof loadDesignSystem>>;
beforeAll(async () => {
  designSystem = await loadDesignSystem(CSS);
});

function fix(source: string, file = "seed.tsx"): string {
  return applyEdits(source, canonicalEdits(source, file, designSystem));
}

describe("tailwind canonical classes", () => {
  it("rewrites arbitrary values that have canonical utilities", () => {
    expect(fix(`<div className="w-[100%] h-[1px] p-[16px] flex" />`)).toBe(
      `<div className="w-full h-px p-4 flex" />`,
    );
  });

  it("checks strings and template parts inside class expressions", () => {
    const call = `<p className={cn("mt-[8px]", on && "rounded-[4px]")} />`;
    const template = `<p className={\`gap-[0.5rem] \${on ? "opacity-[50%]" : "z-[10]"}\`} />`;
    expect(fix(call)).toBe(`<p className={cn("mt-2", on && "rounded-sm")} />`);
    expect(fix(template)).toBe(
      `<p className={\`gap-2 \${on ? "opacity-50" : "z-10"}\`} />`,
    );
  });

  it("normalizes variants, negatives, and important modifiers", () => {
    expect(
      fix(
        `<b class="!font-bold [&>p]:mt-[12px] left-[-4px] hover:bg-[red]" />`,
      ),
    ).toBe(`<b class="font-bold! [&>p]:mt-3 -left-1 hover:bg-[red]" />`);
  });

  it("ignores class strings outside class attributes", () => {
    const source = `export const value = cn("w-[100%]");\n<div title="w-[100%]" />;`;
    expect(canonicalEdits(source, "seed.tsx", designSystem)).toEqual([]);
  });

  it("reports precise offsets for each class", () => {
    const source = `<i className="flex top-[0px]" />`;
    expect(canonicalEdits(source, "seed.tsx", designSystem)).toEqual([
      { start: 19, end: 28, from: "top-[0px]", to: "top-0" },
    ]);
  });
});
