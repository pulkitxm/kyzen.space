"use client";

import OldMaidApp from "@/playingCards/oldMaid/src/App";
import { useParams } from "next/navigation";

export default function OldMaidPage() {
  const params = useParams();
  const gameid = params.gameid as string;

  return (
    <div className="w-full h-screen overflow-hidden bg-[#1b3a2d]">
      <OldMaidApp roomCode={gameid} />
    </div>
  );
}
