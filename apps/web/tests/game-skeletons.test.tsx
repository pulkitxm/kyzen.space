import { describe, expect, test } from "bun:test";
import { DefaultGameSkeleton, getGameSkeleton } from "@gamelobby/games-client";
import { TIC_TAC_TOE } from "@gamelobby/games-core";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type ChatLayout,
  DEFAULT_CHAT_LAYOUT,
  parseChatLayoutCookie,
} from "@/lib/chat-layout";
import { PlaySkeleton } from "../app/play/[gameId]/play-skeleton";

function cookie(layout: Partial<ChatLayout>): string {
  return encodeURIComponent(
    JSON.stringify({ ...DEFAULT_CHAT_LAYOUT, ...layout }),
  );
}

describe("games-client game skeletons", () => {
  test("DefaultGameSkeleton renders non-empty markup", () => {
    const html = renderToStaticMarkup(<DefaultGameSkeleton />);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("animate-pulse");
  });

  test("TicTacToeSkeleton renders 9 board cells", () => {
    const TicTacToeSkeleton = getGameSkeleton(TIC_TAC_TOE);
    const html = renderToStaticMarkup(<TicTacToeSkeleton />);
    expect(html.length).toBeGreaterThan(0);
    const cells = html.match(/size-24/g) ?? [];
    expect(cells.length).toBe(9);
  });

  test("unknown game type falls back to DefaultGameSkeleton", () => {
    const Fallback = getGameSkeleton("not-a-real-game");
    const fallbackHtml = renderToStaticMarkup(<Fallback />);
    const defaultHtml = renderToStaticMarkup(<DefaultGameSkeleton />);
    expect(fallbackHtml).toBe(defaultHtml);
  });
});

describe("PlaySkeleton across ChatLayout variants", () => {
  const mountedDocked = parseChatLayoutCookie(
    cookie({ mode: "mounted", minimized: false, chatWidth: 360 }),
  );
  const popout = parseChatLayoutCookie(
    cookie({
      mode: "popout",
      minimized: false,
      popout: { x: 120, y: 80, w: 380, h: 520 },
    }),
  );
  const minimizedFloating = parseChatLayoutCookie(
    cookie({
      minimized: true,
      stashEdge: null,
      icon: { x: 200, y: 200 },
    }),
  );
  const minimizedStashed = parseChatLayoutCookie(
    cookie({
      minimized: true,
      stashEdge: "left",
      icon: { x: 0, y: 300 },
    }),
  );

  const variants: Array<[string, ChatLayout]> = [
    ["default", DEFAULT_CHAT_LAYOUT],
    ["mounted docked", mountedDocked],
    ["popout", popout],
    ["minimized floating", minimizedFloating],
    ["minimized stashed edge", minimizedStashed],
  ];

  for (const [name, layout] of variants) {
    test(`renders without throwing for ${name} layout`, () => {
      const html = renderToStaticMarkup(<PlaySkeleton layout={layout} />);
      expect(html.length).toBeGreaterThan(0);
    });
  }

  test("docked mounted layout renders the side chat with the configured width", () => {
    const html = renderToStaticMarkup(
      <PlaySkeleton layout={{ ...mountedDocked, chatWidth: 360 }} />,
    );
    expect(html).toContain("border-l");
    expect(html).toContain("360px");
  });

  test("popout layout positions a fixed floating chat panel", () => {
    const html = renderToStaticMarkup(<PlaySkeleton layout={popout} />);
    expect(html).toContain("shadow-2xl");
    expect(html).toContain("fixed");
  });

  test("minimized stashed layout renders a rounded edge tab", () => {
    const html = renderToStaticMarkup(
      <PlaySkeleton layout={minimizedStashed} />,
    );
    expect(html).toContain("rounded-r-lg");
  });

  for (const edge of ["left", "right", "top", "bottom"] as const) {
    test(`minimized ${edge} edge stash renders`, () => {
      const layout = parseChatLayoutCookie(
        cookie({ minimized: true, stashEdge: edge, icon: { x: 50, y: 50 } }),
      );
      const html = renderToStaticMarkup(<PlaySkeleton layout={layout} />);
      expect(html.length).toBeGreaterThan(0);
    });
  }
});
