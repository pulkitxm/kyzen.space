import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

mock.module("@/lib/auth-client", () => ({
  authClient: {
    getSession: async () => ({ data: null }),
    signIn: {
      anonymous: async () => ({ data: { session: { id: "anon" } } }),
      social: async () => ({}),
    },
  },
}));

const { GuestButton } = await import("@/app/auth/guest-button");

describe("GuestButton", () => {
  it("renders the idle continue-as-guest label", () => {
    const html = renderToStaticMarkup(<GuestButton />);
    expect(html).toContain("Continue as a guest");
    expect(html).not.toContain("Starting");
  });

  it("renders an enabled button on first paint", () => {
    const html = renderToStaticMarkup(<GuestButton />);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(/<button[^>]*\sdisabled(=|\s|>)/.test(html)).toBe(false);
  });

  it("shows no error message before any interaction", () => {
    const html = renderToStaticMarkup(<GuestButton />);
    expect(html).not.toContain("text-danger");
    expect(html).not.toContain("Could not start a guest session");
  });

  it("renders the guest icon", () => {
    const html = renderToStaticMarkup(<GuestButton />);
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });
});
