"use client";

import { m, useReducedMotion } from "motion/react";
import {
  FaArrowTrendDown,
  FaArrowTrendUp,
  FaFire,
  FaStar,
} from "react-icons/fa6";
import { PanelHeading } from "./arena-panels";
import type { MatchSummaryStats } from "./mock-arena";

const HEADLINE: Record<MatchSummaryStats["result"], string> = {
  win: "Victory",
  loss: "Defeat",
  draw: "Stalemate",
};

// export function MatchSummary({ stats }: { stats: MatchSummaryStats }) {
//   const reduceMotion = useReducedMotion();
//   const positive = stats.ratingDelta >= 0;

//   return (
//     <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-5">
//       <div className="flex items-center justify-between">
//         <PanelHeading>Match summary</PanelHeading>
//         <span
//           className={[
//             "rounded-full px-2.5 py-0.5 font-semibold text-xs",
//             stats.result === "win"
//               ? "bg-success/15 text-success"
//               : stats.result === "loss"
//                 ? "bg-danger/15 text-danger"
//                 : "bg-warning/15 text-warning",
//           ].join(" ")}
//         >
//           {HEADLINE[stats.result]}
//         </span>
//       </div>

//       <div>
//         <div className="mb-1 flex items-center justify-between text-sm">
//           <span className="font-medium text-card-foreground">
//             Level {stats.xpLevel}
//           </span>
//           <span className="font-semibold text-primary tabular-nums">
//             +{stats.xpGain} XP
//           </span>
//         </div>
//         <div className="h-2.5 overflow-hidden rounded-full bg-background">
//           <m.div
//             className="h-full rounded-full bg-primary"
//             initial={reduceMotion ? false : { width: 0 }}
//             animate={{ width: `${stats.xpInto}%` }}
//             transition={
//               reduceMotion
//                 ? { duration: 0 }
//                 : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
//             }
//           />
//         </div>
//       </div>

//       <div className="grid grid-cols-2 gap-2.5">
//         <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
//           <span
//             className={positive ? "text-success" : "text-danger"}
//             aria-hidden="true"
//           >
//             {positive ? (
//               <FaArrowTrendUp size={16} />
//             ) : (
//               <FaArrowTrendDown size={16} />
//             )}
//           </span>
//           <div>
//             <div
//               className={[
//                 "font-semibold text-sm tabular-nums",
//                 positive ? "text-success" : "text-danger",
//               ].join(" ")}
//             >
//               {positive ? "+" : ""}
//               {stats.ratingDelta}
//             </div>
//             <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">
//               Rating
//             </div>
//           </div>
//         </div>
//         <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
//           <FaFire size={16} className="text-warning" aria-hidden="true" />
//           <div>
//             <div className="font-semibold text-card-foreground text-sm tabular-nums">
//               {stats.streak}
//             </div>
//             <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">
//               Win streak
//             </div>
//           </div>
//         </div>
//       </div>

//       {stats.achievements.length > 0 ? (
//         <div className="flex flex-wrap gap-1.5">
//           {stats.achievements.map((a) => (
//             <span
//               key={a}
//               className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 font-medium text-primary text-xs"
//             >
//               <FaStar size={11} aria-hidden="true" />
//               {a}
//             </span>
//           ))}
//         </div>
//       ) : null}
//     </div>
//   );
// }
