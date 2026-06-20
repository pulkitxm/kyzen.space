import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/account-merge", () => ({
  getPendingMerge: async () => null,
  confirmMerge: async () => {},
  discardMerge: async () => {},
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { MergeConsentDialog } = await import("@/app/merge-consent");

import type { PendingMerge } from "@/lib/account-merge";

const pending: PendingMerge = {
  id: "merge-1",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  targetEmail: "you@gmail.com",
  summary: { games: 12, conversations: 3, friends: 2, statLines: 1 },
};

describe("MergeConsentDialog", () => {
  it("renders counts and the target email when a merge is pending", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={pending} busy={false} />,
    );
    expect(html).toContain("12");
    expect(html).toContain("you@gmail.com");
    expect(html).toContain("Merge");
    expect(html).toContain("Discard");
  });

  it("renders nothing when there is no pending merge", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={null} busy={false} />,
    );
    expect(html).toBe("");
  });

  it("never leaks anon ids or raw chat data into the markup", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={pending} busy={false} />,
    );
    expect(html).not.toContain("anon");
    expect(html).not.toContain("message");
  });
});
