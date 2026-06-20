import { atom } from "jotai";

type MatchmakingState = { searching: string | null };

export const matchmakingAtom = atom<MatchmakingState>({ searching: null });
