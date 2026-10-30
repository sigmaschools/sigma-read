/**
 * Display helpers for the per-skill ratings in comprehension reports, shared by the
 * guide and admin views. Pure, so the summary can be tested without a database.
 */

import { SKILLS, type Skill } from "./report-schema";

export const SKILL_LABELS: Record<Skill, string> = {
  main_idea: "Main idea", key_details: "Key details", vocabulary: "Vocabulary", inference: "Inference", connection: "Connection",
};

export const SKILL_RATING_LABELS: Record<string, string> = {
  shown: "shown", partly: "partly", not_shown: "not shown", not_tested: "not tested",
};

export const SKILL_COLORS: Record<string, string> = {
  shown: "bg-green-50 text-green-700", partly: "bg-amber-50 text-amber-700",
  not_shown: "bg-red-50 text-red-700", not_tested: "bg-gray-100 text-gray-500",
};

export interface SkillSummaryRow {
  skill: Skill;
  label: string;
  /** Reports where this skill came up (anything but not_tested) */
  tested: number;
  shown: number;
  partly: number;
  notShown: number;
}

/**
 * Tally each skill across reports (newest first), using at most `limit` reports that
 * have skill ratings. Reports from before skills were rated are skipped.
 */
export function skillSummary(reports: { skills?: Record<string, string> | null }[], limit = 10): { rows: SkillSummaryRow[]; reports: number } {
  const rated = reports.filter(r => r.skills && Object.keys(r.skills).length > 0).slice(0, limit);
  const rows = SKILLS.map(skill => {
    const row: SkillSummaryRow = { skill, label: SKILL_LABELS[skill], tested: 0, shown: 0, partly: 0, notShown: 0 };
    for (const r of rated) {
      const rating = r.skills![skill];
      if (rating === "shown") row.shown++;
      else if (rating === "partly") row.partly++;
      else if (rating === "not_shown") row.notShown++;
      else continue;
      row.tested++;
    }
    return row;
  });
  return { rows, reports: rated.length };
}

export const REPORT_FLAGS = ["score_too_high", "score_too_low", "other"] as const;
export type ReportFlag = (typeof REPORT_FLAGS)[number];

export const REPORT_FLAG_LABELS: Record<ReportFlag, string> = {
  score_too_high: "Score too high",
  score_too_low: "Score too low",
  other: "Something else is off",
};
