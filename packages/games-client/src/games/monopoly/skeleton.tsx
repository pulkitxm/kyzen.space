import type React from "react";
import { SkeletonBox } from "../../skeletons";

const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(9, 1fr)",
  gridTemplateRows: "repeat(9, 1fr)",
  width: "100%",
  aspectRatio: "1",
  gap: 2,
  background: "var(--border)",
  borderRadius: 10,
  padding: 4,
};

export function MonopolySkeleton() {
  const CELLS = Array.from({ length: 81 });

  return (
    <div className="flex h-full w-full items-start justify-center p-4">
      <div
        style={{
          width: "min(100%, calc(100vh - 120px))",
          maxWidth: "100%",
          aspectRatio: "1",
        }}
      >
        <div style={GRID_STYLE}>
          {CELLS.map((_, idx) => {
            const r = Math.floor(idx / 9);
            const c = idx % 9;
            const isBorder = r === 0 || r === 8 || c === 0 || c === 8;
            const cellKey = `cell-${r}-${c}`;

            return isBorder ? (
              <SkeletonBox key={cellKey} className="size-full rounded" />
            ) : (
              <div key={cellKey} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
