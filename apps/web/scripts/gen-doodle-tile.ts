// One-off generator: builds a seamless doodle tile from Lucide (ISC) line icons.
// Fetches each icon's SVG, extracts its inner shapes, and scatters them on a
// jittered grid kept clear of the tile edges so `repeat` never clips one.
// Usage: bun gen-doodle-tile.ts <out.svg> <tile> <comma,separated,icon,names>
export {};

const [, , outPath, tileArg, namesArg] = process.argv;
const TILE = Number(tileArg);
const names = namesArg
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function fetchInner(name: string): Promise<string | null> {
  const url = `https://unpkg.com/lucide-static@latest/icons/${name}.svg`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const m = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    const inner = m?.[1]?.trim();
    return inner && inner.length > 0 ? inner : null;
  } catch {
    return null;
  }
}

const fetched = await Promise.all(
  names.map(async (n) => ({ name: n, inner: await fetchInner(n) })),
);
const icons = fetched.filter((f): f is { name: string; inner: string } =>
  Boolean(f.inner),
);
const missing = fetched.filter((f) => !f.inner).map((f) => f.name);
if (missing.length) console.warn("skipped (not found):", missing.join(", "));
if (icons.length < 6)
  throw new Error(`too few icons resolved: ${icons.length}`);

// 5x5 jittered grid (cells of TILE/5), icons re-centred from Lucide's 24x24 box.
const step = TILE / 5;
const centers = [0, 1, 2, 3, 4].map((i) => Math.round(step / 2 + i * step));
const defs: string[] = [];
icons.forEach((ic, i) => {
  defs.push(`    <g id="ic-${i}">${ic.inner}</g>`);
});

const uses: string[] = [];
let k = 0;
for (const cy of centers) {
  for (const cx of centers) {
    const ic = k % icons.length;
    // deterministic-ish pseudo-jitter from the index
    const jx = ((k * 37) % 13) - 6;
    const jy = ((k * 53) % 13) - 6;
    const rot = ((k * 47) % 37) - 18;
    uses.push(
      `    <use href="#ic-${ic}" transform="translate(${cx + jx},${cy + jy}) rotate(${rot}) translate(-12,-12)" />`,
    );
    k++;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" fill="none">
  <!--
    Seamless doodle tile composed from Lucide icons (ISC license,
    https://lucide.dev). Used as a CSS mask (alpha) and tinted by the theme.
  -->
  <defs>
${defs.join("\n")}
  </defs>
  <g stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
${uses.join("\n")}
  </g>
</svg>
`;

await Bun.write(outPath, svg);
console.log(
  `wrote ${outPath}: ${icons.length} icons, ${uses.length} placements`,
);
