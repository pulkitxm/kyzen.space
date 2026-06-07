import { describe, expect, test } from "bun:test";
import { CARD_RANKS, CARD_SUITS } from "@gamelobby/shared/constants";
import {
  CARD_VIEWBOX,
  cardBackSvg,
  cardInner,
  cardSvg,
  jokerSvg,
} from "../src/index";

describe("playing-cards svg builder", () => {
  test("every suit and rank renders a non-empty svg with a label", () => {
    for (const suit of CARD_SUITS) {
      for (const rank of CARD_RANKS) {
        const svg = cardSvg(suit, rank);
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain(`viewBox="${CARD_VIEWBOX}"`);
        expect(svg).toContain(`aria-label="${rank} of`);
      }
    }
  });

  test("jokers and back render", () => {
    expect(jokerSvg("red")).toContain('aria-label="red Joker"');
    expect(jokerSvg("black")).toContain('aria-label="black Joker"');
    expect(cardBackSvg()).toContain('aria-label="Card back"');
  });

  test("themeable parts reference theme variables", () => {
    const svg = cardSvg("hearts", "Q");
    expect(svg).toContain("var(--pc-gold");
    expect(svg).toContain("var(--pc-robe");
    expect(cardBackSvg()).toContain("var(--pc-back");
  });

  test("suit pips keep their classic red/black colors", () => {
    expect(cardInner("hearts", "5")).toContain('fill="#C8102E"');
    expect(cardInner("spades", "5")).toContain('fill="#16161D"');
  });

  test("no baked drop-shadow on the card", () => {
    expect(cardInner("clubs", "A")).not.toContain("url(#shadow)");
  });

  test("idPrefix namespaces ids and references so instances don't collide", () => {
    const prefixed = cardInner("diamonds", "K", "x1-");
    expect(prefixed).toContain('id="x1-goldFoil"');
    expect(prefixed).toContain("url(#x1-goldFoil)");
    expect(prefixed).not.toContain('id="goldFoil"');
    expect(prefixed).not.toContain("url(#goldFoil)");
  });
});
