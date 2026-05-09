"use client";

import OldMaidApp from "@/playingCards/oldMaid/src/App";
import "@/playingCards/oldMaid/src/styles/cards.css";

export default function OldMaidHomePage() {
  return (
    <div className="w-full h-screen overflow-hidden bg-[#1b3a2d]">
      <OldMaidApp />
    </div>
  );
}
