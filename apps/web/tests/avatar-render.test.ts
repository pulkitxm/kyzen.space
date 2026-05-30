import { describe, expect, it } from "bun:test";
import { avataaars } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import type {
  AvatarColorKey,
  AvatarConfig,
  AvatarOptionKey,
} from "@gamelobby/avatar";
import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  randomAvatarConfig,
  seedAvatarConfig,
  toDicebearOptions,
} from "@gamelobby/avatar";

function render(config: AvatarConfig): string {
  return createAvatar(
    avataaars,
    toDicebearOptions(config) as unknown as Parameters<typeof createAvatar>[1],
  ).toString();
}

const PROBABILITY_KEY: Partial<Record<AvatarOptionKey, string>> = {
  top: "topProbability",
  accessories: "accessoriesProbability",
  facialHair: "facialHairProbability",
};

describe("DiceBear renders a baseline character", () => {
  it("produces a valid SVG", () => {
    const svg = render(randomAvatarConfig("e2e-baseline"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg.length).toBeGreaterThan(500);
  });

  it("produces a data URI usable as an <img src>", () => {
    const uri = createAvatar(
      avataaars,
      toDicebearOptions(randomAvatarConfig("e2e-uri")) as unknown as Parameters<
        typeof createAvatar
      >[1],
    ).toDataUri();
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
  });
});

describe("every option value renders through the real engine", () => {
  const optionKeys: AvatarOptionKey[] = [
    "top",
    "accessories",
    "facialHair",
    "clothing",
    "eyes",
    "eyebrows",
    "mouth",
  ];

  for (const key of optionKeys) {
    for (const value of AVATAR_OPTIONS[key]) {
      it(`renders ${key}=${value}`, () => {
        if (value === "none") {
          const cfg = randomAvatarConfig("opt-none");
          cfg[key] = "none";
          const svg = render(cfg);
          expect(svg.startsWith("<svg")).toBe(true);
          return;
        }
        const probKey = PROBABILITY_KEY[key];
        const opts: Record<string, unknown> = { [key]: [value] };
        if (probKey) opts[probKey] = 100;
        const svg = createAvatar(
          avataaars,
          opts as Parameters<typeof createAvatar>[1],
        ).toString();
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg.length).toBeGreaterThan(200);
      });
    }
  }
});

describe("every palette color is accepted by the engine", () => {
  const colorKeys: AvatarColorKey[] = [
    "skinColor",
    "hairColor",
    "hatColor",
    "accessoriesColor",
    "facialHairColor",
    "clothesColor",
    "backgroundColor",
  ];

  for (const key of colorKeys) {
    for (const hex of AVATAR_COLORS[key]) {
      it(`renders ${key}=#${hex}`, () => {
        const svg = createAvatar(avataaars, {
          [key]: [hex],
        } as Parameters<typeof createAvatar>[1]).toString();
        expect(svg.startsWith("<svg")).toBe(true);
      });
    }
  }
});

describe("rendering is deterministic for a fixed config", () => {
  it("same config → identical SVG", () => {
    const cfg = randomAvatarConfig("determinism");
    expect(render(cfg)).toBe(render(cfg));
  });

  it("seed-derived fallback renders the same SVG every time", () => {
    const a = render(seedAvatarConfig("stable-user"));
    const b = render(seedAvatarConfig("stable-user"));
    expect(a).toBe(b);
  });
});

describe("optional parts visibly toggle in the output", () => {
  it("background color appears in the SVG", () => {
    const cfg: AvatarConfig = {
      ...randomAvatarConfig("bg"),
      backgroundColor: "ffd5dc",
    };
    expect(render(cfg).toLowerCase()).toContain("ffd5dc");
  });

  it("a fully-loaded character (all optional parts on) still renders", () => {
    const cfg: AvatarConfig = {
      ...randomAvatarConfig("loaded"),
      accessories: "sunglasses",
      facialHair: "beardMajestic",
      top: "turban",
    };
    const svg = render(cfg);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("a minimal character (optional parts off) still renders", () => {
    const cfg: AvatarConfig = {
      ...randomAvatarConfig("minimal"),
      accessories: "none",
      facialHair: "none",
    };
    const svg = render(cfg);
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
