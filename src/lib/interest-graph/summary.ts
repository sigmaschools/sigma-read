/**
 * The plain-words view of a student's interests for admins (compass.ts fills it from Compass's interests).
 */

/** Shown as an interest from this score up */
export const SHOWN_MIN = 0.15;

export interface InterestSummary {
  /** Strongest first */
  current: { slug: string; score: number; isNew: boolean; declared: boolean }[];
  /** Declared (or restored) interests that have faded below the shown threshold, or turned negative */
  fading: { slug: string; score: number }[];
  /** Turned off by the student ("No more") or an adult */
  removed: { slug: string }[];
}
