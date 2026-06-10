import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TttMark, TttMarkDefs } from "../src/games/tic-tac-toe/marks";

describe("TttMark", () => {
  test("the X glyph uses the primary color and is labeled X", () => {
    const html = renderToStaticMarkup(<TttMark mark="X" />);
    expect(html).toContain("text-primary");
    expect(html).toContain('aria-label="X"');
    expect(html).toContain("rotate(45 50 50)");
  });

  test("the O glyph uses the muted color and is labeled O", () => {
    const html = renderToStaticMarkup(<TttMark mark="O" />);
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain('aria-label="O"');
    expect(html).not.toContain("text-primary");
  });

  test("appends a caller className alongside the color class", () => {
    const html = renderToStaticMarkup(
      <TttMark className="size-4 shrink-0" mark="X" />,
    );
    expect(html).toContain("text-primary");
    expect(html).toContain("size-4 shrink-0");
  });

  test("a non-decorative mark exposes its role and label without aria-hidden", () => {
    const html = renderToStaticMarkup(<TttMark mark="X" />);
    expect(html).toContain('role="img"');
    expect(html).not.toContain("aria-hidden");
  });

  test("a decorative mark is hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<TttMark decorative mark="O" />);
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("TttMarkDefs", () => {
  test("renders a zero-size hidden svg holding the shared sheen gradient", () => {
    const html = renderToStaticMarkup(<TttMarkDefs />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('id="ttt-mark-sheen"');
    expect(html).toContain('width="0"');
  });
});
