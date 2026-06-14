import { describe, expect, test } from "bun:test";
import { CARD_RANKS, CARD_SUITS } from "@kyzen/shared/constants";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CardBack,
  Joker,
  PlayingCard,
} from "../src/playing-cards/playing-card";

describe("PlayingCard component", () => {
  test("renders an accessible img svg with the shared viewBox", () => {
    const html = renderToStaticMarkup(<PlayingCard rank="Q" suit="hearts" />);
    expect(html).toStartWith("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('viewBox="0 0 360 504"');
    expect(html).toContain('aria-label="Q of Hearts"');
  });

  test("forwards className and inline style to the svg element", () => {
    const html = renderToStaticMarkup(
      <PlayingCard className="h-auto w-full" rank="K" suit="spades" />,
    );
    expect(html).toContain('class="h-auto w-full"');
    expect(html).toContain('aria-label="K of Spades"');
  });

  test("injects card body markup, not an empty svg", () => {
    const html = renderToStaticMarkup(<PlayingCard rank="A" suit="clubs" />);
    expect(html.length).toBeGreaterThan(200);
    expect(html).toContain("<defs>");
  });

  test("every suit and rank renders a labeled svg", () => {
    for (const suit of CARD_SUITS) {
      for (const rank of CARD_RANKS) {
        const html = renderToStaticMarkup(
          <PlayingCard rank={rank} suit={suit} />,
        );
        expect(html).toStartWith("<svg");
        expect(html).toContain("aria-label=");
      }
    }
  });
});

describe("Joker component", () => {
  test("defaults to the red variant when none is given", () => {
    const html = renderToStaticMarkup(<Joker />);
    expect(html).toContain('aria-label="red Joker"');
  });

  test("honors an explicit black variant", () => {
    const html = renderToStaticMarkup(<Joker variant="black" />);
    expect(html).toContain('aria-label="black Joker"');
  });

  test("renders as an img with the shared viewBox", () => {
    const html = renderToStaticMarkup(<Joker variant="red" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('viewBox="0 0 360 504"');
  });
});

describe("CardBack component", () => {
  test("renders the card-back label as an img svg", () => {
    const html = renderToStaticMarkup(<CardBack />);
    expect(html).toStartWith("<svg");
    expect(html).toContain('aria-label="Card back"');
    expect(html).toContain('role="img"');
    expect(html).toContain('viewBox="0 0 360 504"');
  });
});

describe("inline svg id isolation across instances", () => {
  test("two cards on one page get distinct id prefixes", () => {
    const html = renderToStaticMarkup(
      <div>
        <PlayingCard rank="Q" suit="hearts" />
        <PlayingCard rank="K" suit="spades" />
      </div>,
    );
    const prefixes = [...html.matchAll(/id="(pc[^"]*?)card"/g)].map(
      (match) => match[1],
    );
    expect(prefixes.length).toBe(2);
    expect(prefixes[0]).not.toBe(prefixes[1]);
  });

  test("a single card namespaces its url references with its id prefix", () => {
    const html = renderToStaticMarkup(<PlayingCard rank="Q" suit="hearts" />);
    const idMatch = html.match(/id="(pc[A-Za-z0-9]*?-)card"/);
    expect(idMatch).not.toBeNull();
    const prefix = idMatch?.[1] ?? "";
    expect(prefix.length).toBeGreaterThan(0);
    expect(html).toContain(`url(#${prefix}`);
  });
});
