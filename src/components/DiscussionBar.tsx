"use client";

import { answerTier } from "@/lib/answer-points";

/** Under the bar, so students know how it works (owner, 17 Nov 2026) */
export const ANSWER_POINTS_HINT = "Better answers move the bar further.";

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
    <div className="mt-3">
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        {pop && tier !== "quiet" && (
          <span
            key={pop.key}
            role="status"
            aria-label={`${pop.points} points`}
            className={`points-pop pointer-events-none absolute bottom-full mb-1 z-20 whitespace-nowrap tabular-nums leading-none ${tier === "great" ? "points-rise-great text-5xl font-black" : "points-rise text-3xl font-extrabold"}`}
            style={{ left: `${Math.max(10, Math.min(fill, 85))}%`, color: tier === "great" ? "var(--great)" : "var(--accent)" }}
          >
            +{pop.points}
          </span>
        )}
        {/* The track glows as a good answer lands; the fill keeps its own slide */}
        {pop && tier !== "quiet" && <div key={`glow-${pop.key}`} className={`${tier === "great" ? "bar-glow-great" : "bar-glow"} pointer-events-none absolute inset-0 rounded-full`} />}
        <div className={`${answerPoints ? "h-3" : "h-1.5"} bg-gray-200 rounded-full overflow-hidden`}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${fill}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-gray-400 tracking-wide flex-shrink-0">DONE</span>
    </div>
    {answerPoints && (
      <p className="mt-1.5 text-xs text-[var(--muted)]">{ANSWER_POINTS_HINT}</p>
    )}
    </div>
  );
}
