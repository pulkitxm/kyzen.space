import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/auth-client", () => ({
  authClient: { signIn: { social: async () => ({}) } },
}));

const { decideGuestNudge } = await import("@/lib/guest-nudge");
const { GuestNudge } = await import("@/app/guest-nudge");

const NOW = 1_000_000;

describe("decideGuestNudge", () => {
  it("never shows for a non-anonymous user", () => {
    expect(
      decideGuestNudge({
        isAnonymous: false,
        seen: null,
        snoozedUntil: 0,
        now: NOW,
      }),
    ).toEqual({ show: false, markSeen: false });
    expect(
      decideGuestNudge({
        isAnonymous: false,
        seen: "1",
        snoozedUntil: 0,
        now: NOW,
      }),
    ).toEqual({ show: false, markSeen: false });
  });

  it("does not show on the first visit, but records the guest", () => {
    expect(
      decideGuestNudge({
        isAnonymous: true,
        seen: null,
        snoozedUntil: 0,
        now: NOW,
      }),
    ).toEqual({ show: false, markSeen: true });
  });

  it("shows on a return visit when seen before and not snoozed", () => {
    expect(
      decideGuestNudge({
        isAnonymous: true,
        seen: "1",
        snoozedUntil: 0,
        now: NOW,
      }),
    ).toEqual({ show: true, markSeen: false });
  });

  it("stays hidden while snoozed, then shows once the snooze elapses", () => {
    expect(
      decideGuestNudge({
        isAnonymous: true,
        seen: "1",
        snoozedUntil: NOW + 1000,
        now: NOW,
      }),
    ).toEqual({ show: false, markSeen: false });
    expect(
      decideGuestNudge({
        isAnonymous: true,
        seen: "1",
        snoozedUntil: NOW - 1,
        now: NOW,
      }),
    ).toEqual({ show: true, markSeen: false });
  });
});

describe("GuestNudge", () => {
  it("renders nothing on the server (the pop-up is gated on a client return-session)", () => {
    expect(renderToStaticMarkup(<GuestNudge />)).toBe("");
  });
});
