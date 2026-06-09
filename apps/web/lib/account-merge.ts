"use client";

import { clientFetchJson } from "@/lib/api-client";

type MergeSummary = {
  games: number;
  conversations: number;
  friends: number;
  statLines: number;
};

export type PendingMerge = {
  id: string;
  status: "pending" | "confirmed" | "discarded";
  createdAt: string;
  targetEmail: string | null;
  summary: MergeSummary;
};

export async function getPendingMerge(): Promise<PendingMerge | null> {
  const res = await clientFetchJson<{ pending: PendingMerge | null }>(
    "/api/account/merge/pending",
  );
  return res.pending;
}

export async function confirmMerge(id: string): Promise<void> {
  await clientFetchJson(`/api/account/merge/${id}/confirm`, { method: "POST" });
}

export async function discardMerge(id: string): Promise<void> {
  await clientFetchJson(`/api/account/merge/${id}/discard`, { method: "POST" });
}
