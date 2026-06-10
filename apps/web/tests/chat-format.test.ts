import { describe, expect, it } from "bun:test";
import type { MessageJson } from "@gamelobby/shared/types";
import { messagePreview, relativeTime, timeOfDay } from "@/lib/chat/format";

function isoSecondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function message(overrides: Partial<MessageJson>): MessageJson {
  return {
    id: "m1",
    conversationId: "c1",
    sender: null,
    kind: "text",
    body: null,
    metadata: null,
    gameId: null,
    createdAt: null,
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("timeOfDay", () => {
  it("renders an explicit (en-US) day period, not a locale-dependent one", () => {
    const result = timeOfDay("2026-05-30T15:31:00Z");
    expect(result).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/);
  });

  it("returns an empty string for missing input", () => {
    expect(timeOfDay(null)).toBe("");
    expect(timeOfDay(undefined)).toBe("");
  });

  it("returns an empty string for an empty-string timestamp", () => {
    expect(timeOfDay("")).toBe("");
  });
});

describe("relativeTime", () => {
  it("renders 'now' for sub-minute timestamps", () => {
    expect(relativeTime(isoSecondsAgo(5))).toBe("now");
    expect(relativeTime(isoSecondsAgo(59))).toBe("now");
  });

  it("renders minutes once the gap reaches a full minute", () => {
    expect(relativeTime(isoSecondsAgo(60))).toBe("1m");
    expect(relativeTime(isoSecondsAgo(59 * 60))).toBe("59m");
  });

  it("renders hours once the gap reaches an hour", () => {
    expect(relativeTime(isoSecondsAgo(60 * 60))).toBe("1h");
    expect(relativeTime(isoSecondsAgo(23 * 60 * 60))).toBe("23h");
  });

  it("renders days once the gap reaches a day, up to a week", () => {
    expect(relativeTime(isoSecondsAgo(24 * 60 * 60))).toBe("1d");
    expect(relativeTime(isoSecondsAgo(6 * 24 * 60 * 60))).toBe("6d");
  });

  it("renders an explicit (en-US) date for old timestamps", () => {
    expect(relativeTime("2020-01-04T12:00:00Z")).toBe("Jan 4");
  });

  it("returns an empty string for missing input", () => {
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(undefined)).toBe("");
    expect(relativeTime("")).toBe("");
  });
});

describe("messagePreview", () => {
  it("returns the empty-conversation placeholder for a null message", () => {
    expect(messagePreview(null)).toBe("No messages yet");
  });

  it("prioritizes the deleted placeholder over the kind, even for a gif", () => {
    expect(
      messagePreview(
        message({ kind: "gif", deletedAt: "2026-01-01T00:00:00.000Z" }),
      ),
    ).toBe("Message deleted");
  });

  it("renders a kind-specific label for gif/game_card/system", () => {
    expect(messagePreview(message({ kind: "gif" }))).toBe("GIF");
    expect(messagePreview(message({ kind: "game_card" }))).toBe(
      "🎮 Game session",
    );
    expect(messagePreview(message({ kind: "system" }))).toBe(
      "Updated the conversation",
    );
  });

  it("falls back to the text body, and to an empty string when the body is null", () => {
    expect(messagePreview(message({ kind: "text", body: "hello" }))).toBe(
      "hello",
    );
    expect(messagePreview(message({ kind: "text", body: null }))).toBe("");
  });
});
