"use client";

import { answerTier } from "@/lib/answer-points";

/**
 * The discussion's progress bar. Without answer points it is the thin bar students have always
 * had. With answer points (src/lib/answer-points.ts) it is taller, and a good answer's points rise
 * from the end of the fill and fade; the best answers' points are bigger, bolder and in their own
 * colour. Thin answers move the bar without a number.
 *
 * `pop` changes identity on each new answer (its `key`), which restarts the animation.
 */
export function DiscussionBar({ progress, answerPoints, pop }: {
  progress: number;
  answerPoints: boolean;
  pop: { points: number; key: number } | null;
}) {
  const fill = Math.max(0, Math.min(100, progress));
  const color = fill >= 100 ? "#22c55e" : fill >= 50 ? "#86efac" : answerPoints ? "#93c5fd" : "#d1d5db";
  const tier = pop ? answerTier(pop.points) : "quiet";

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="relative flex-1">
        {pop && tier !== "quiet" && (
          <span
            key={pop.key}
            role="status"
            className={`pointer-events-none absolute bottom-full mb-1 whitespace-nowrap tabular-nums ${tier === "great" ? "points-rise-great text-lg font-extrabold" : "points-rise text-sm font-semibold"}`}
            style={{ left: `${fill}%`, color: tier === "great" ? "var(--great)" : "var(--accent)" }}
          >
            +{pop.points}
          </span>
        )}
        <div className={`${answerPoints ? "h-2.5" : "h-1.5"} bg-gray-200 rounded-full overflow-hidden`}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${fill}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-gray-400 tracking-wide flex-shrink-0">DONE</span>
    </div>
  );
}
