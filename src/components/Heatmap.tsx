"use client";

import { useState } from "react";
import type { CalendarDay } from "@/lib/types";

const CELL = 11;
const GAP = 2;

function bucket(count: number, max: number): number {
  if (count <= 0) return 0;
  const q = count / Math.max(1, max);
  return q > 0.75 ? 4 : q > 0.5 ? 3 : q > 0.25 ? 2 : 1;
}

/** Last-year contribution heatmap: sequential single-hue ramp, per-cell hover tooltip. */
export function Heatmap({ days }: { days: CalendarDay[] }) {
  const [hover, setHover] = useState<{ d: CalendarDay; x: number; y: number } | null>(null);
  if (days.length === 0) return <p className="text-sm text-ink-3">No contribution data.</p>;

  const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const max = Math.max(...days.map((d) => d.count));
  const weeks = Math.ceil((days.length + firstDow) / 7);
  const width = weeks * (CELL + GAP);
  const height = 7 * (CELL + GAP);
  const total = days.reduce((a, d) => a + d.count, 0);

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${total} contributions in the last year`}
          onMouseLeave={() => setHover(null)}
        >
          {days.map((d, i) => {
            const idx = i + firstDow;
            const x = Math.floor(idx / 7) * (CELL + GAP);
            const y = (idx % 7) * (CELL + GAP);
            return (
              <rect
                key={d.date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                fill={`var(--seq-${bucket(d.count, max)})`}
                onMouseEnter={() => setHover({ d, x, y })}
              />
            );
          })}
        </svg>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm"
          style={{ left: Math.min(hover.x, width - 140), top: hover.y + CELL + 6 }}
        >
          <span className="font-semibold tabular">{hover.d.count}</span>{" "}
          <span className="text-ink-2">contribution{hover.d.count === 1 ? "" : "s"} on {hover.d.date}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-ink-3">
        Less
        {[0, 1, 2, 3, 4].map((b) => (
          <span key={b} className="inline-block h-[11px] w-[11px] rounded-[2px]" style={{ background: `var(--seq-${b})` }} />
        ))}
        More
      </div>
    </div>
  );
}
