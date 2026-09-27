"use client";

import { useState } from "react";

const W = 280;
const H = 64;
const PAD = 6;

/** Score-over-time sparkline with a crosshair + tooltip. Single series: the title names it, no legend. */
export function ScoreHistory({ points }: { points: { at: string; score: number }[] }) {
  const [i, setI] = useState<number | null>(null);
  if (points.length < 2) return <p className="text-xs text-ink-3">History appears after the next sync.</p>;

  const scores = points.map((p) => p.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = Math.max(1, hi - lo);
  const x = (k: number) => PAD + (k / (points.length - 1)) * (W - 2 * PAD);
  const y = (s: number) => H - PAD - ((s - lo) / span) * (H - 2 * PAD);
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    setI(Math.max(0, Math.min(points.length - 1, Math.round(((rel - PAD) / (W - 2 * PAD)) * (points.length - 1)))));
  }

  const cur = i === null ? null : points[i];
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`Builder Score history, ${scores[0]} to ${scores.at(-1)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setI(null)}
      >
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {cur && i !== null && (
          <line x1={x(i)} x2={x(i)} y1={0} y2={H} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {cur && i !== null && (
        // The SVG stretches non-uniformly, so the marker is HTML to stay round.
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-accent"
          style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(cur.score) / H) * 100}%` }}
        />
      )}
      {cur && (
        <div className="pointer-events-none absolute -top-2 right-0 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm">
          <span className="font-semibold tabular">{cur.score}</span>{" "}
          <span className="text-ink-2">{new Date(cur.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}
