import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/auth-client", () => ({
  authClient: { signIn: { social: async () => ({}) } },
}));

const { GuestNudge } = await import("@/app/guest-nudge");

describe("GuestNudge", () => {
  it("renders a sign-in prompt for anonymous users", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={true} />);
    expect(html).toContain("Sign in to save");
  });

  it("renders nothing for non-anonymous users", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={false} />);
    expect(html).toBe("");
  });

  it("shows the idle sign-in label, not the redirecting label, on first render", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={true} />);
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("Redirecting");
  });

  it("renders an enabled sign-in button for an anonymous user", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={true} />);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(/<button[^>]*\sdisabled(=|\s|>)/.test(html)).toBe(false);
  });

  it("renders an icon for the sign-in affordance", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={true} />);
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });

  it("emits no button or prompt markup at all when not anonymous", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={false} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Sign in");
  });
});
