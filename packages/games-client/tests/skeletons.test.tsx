import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DefaultGameSkeleton, SkeletonBox } from "../src/skeletons";

describe("SkeletonBox", () => {
  test("is aria-hidden so the pulse is not announced", () => {
    const html = renderToStaticMarkup(<SkeletonBox />);
    expect(html).toContain('aria-hidden="true"');
  });

  test("always carries the base pulse classes", () => {
    const html = renderToStaticMarkup(<SkeletonBox />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("rounded-md");
    expect(html).toContain("bg-foreground/30");
  });

  test("appends a caller className onto the base classes", () => {
    const html = renderToStaticMarkup(<SkeletonBox className="h-6 w-40" />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("h-6 w-40");
  });

  test("renders with no className argument via the empty-string default", () => {
    const html = renderToStaticMarkup(<SkeletonBox />);
    expect(html).toStartWith("<div");
    expect(html).not.toContain("undefined");
  });

  test("forwards arbitrary div props through the spread", () => {
    const html = renderToStaticMarkup(
      <SkeletonBox data-region="board" id="probe" />,
    );
    expect(html).toContain('data-region="board"');
    expect(html).toContain('id="probe"');
  });
});

describe("DefaultGameSkeleton", () => {
  test("renders a pulsing generic board placeholder", () => {
    const html = renderToStaticMarkup(<DefaultGameSkeleton />);
    expect(html).toStartWith("<div");
    expect(html).toContain("animate-pulse");
  });

  test("includes the square board area and header rows", () => {
    const html = renderToStaticMarkup(<DefaultGameSkeleton />);
    expect(html).toContain("aspect-square");
    const pulses = html.match(/animate-pulse/g) ?? [];
    expect(pulses.length).toBeGreaterThanOrEqual(3);
  });

  test("takes no props and renders deterministically", () => {
    const first = renderToStaticMarkup(<DefaultGameSkeleton />);
    const second = renderToStaticMarkup(<DefaultGameSkeleton />);
    expect(first).toBe(second);
  });
});
