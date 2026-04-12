/**
 * Pure logic for level progression — no DB dependencies.
 * Extracted so we can unit-test without a database connection.
 */

export interface FeedMix {
  probeDirection: "up" | "down" | null;
  probePhase: number;
  probeStartDate: string | null;
  probeScores: number[];
}

export interface LevelEvalResult {
  action: "none" | "start_probe_up" | "start_probe_down" | "advance_probe" | "abort_probe" | "level_change" | "confidence_boost" | "guide_alert";
  newFeedMix?: FeedMix;
  newLevel?: number;
  alertMessage?: string;
}

export const DEFAULT_MIX: FeedMix = { probeDirection: null, probePhase: 0, probeStartDate: null, probeScores: [] };

/**
 * Trimmed mean: if >= 4 scores, drop the single lowest, then average the rest.
 * Otherwise plain average. Returns 0 for empty arrays.
 */
export function trimmedMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  let s = [...scores];
  if (s.length >= 4) {
    s.sort((a, b) => a - b);
    s = s.slice(1); // drop lowest
  }
  return s.reduce((a, b) => a + b, 0) / s.length;
}

/**
 * Check if recent scores trigger an upward probe.
 * Unified rule: 3 of last 4 scores >= 80.
 */
export function checkUpwardTrigger(scores: { score: number }[]): boolean {
  const last4 = scores.slice(-4);
  if (last4.length < 4) return false;
  return last4.filter(s => s.score >= 80).length >= 3;
}

/**
 * Check if recent scores trigger a downward probe.
 * Unified rule: 2 consecutive scores < 60.
 */
export function checkDownwardTrigger(scores: { score: number }[]): boolean {
  const last2 = scores.slice(-2);
  if (last2.length < 2) return false;
  return last2.every(s => s.score < 60);
}

export function evaluateUpwardProbe(
  student: { name: string },
  feedMix: FeedMix,
  scores: { score: number; articleLevel: number }[],
  level: number,
): LevelEvalResult {
  const probeLevel = level + 1;
  const probeScores = feedMix.probeScores;

  const recentProbeScores = scores.filter(s => s.articleLevel === probeLevel);
  const allProbeScores = [...probeScores, ...recentProbeScores.map(s => s.score)];

  // Abort: 2 probe scores below 65
  const failedProbes = allProbeScores.filter(s => s < 65).length;
  if (failedProbes >= 2) {
    return {
      action: "abort_probe",
      newFeedMix: DEFAULT_MIX,
    };
  }

  // Phase 1 → Phase 2: 2 of first 3 probe scores >= 75
  if (feedMix.probePhase === 1 && allProbeScores.length >= 2) {
    const passing = allProbeScores.filter(s => s >= 75).length;
    if (passing >= 2) {
      return {
        action: "advance_probe",
        newFeedMix: { ...feedMix, probePhase: 2, probeScores: allProbeScores },
      };
    }
  }

  // Phase 2 → Level change: trimmedMean >= 75 with at least 3 probe scores
  if (feedMix.probePhase === 2 && allProbeScores.length >= 3) {
    if (trimmedMean(allProbeScores) >= 75) {
      return {
        action: "level_change",
        newLevel: probeLevel,
        newFeedMix: DEFAULT_MIX,
      };
    }
  }

  // Still gathering data
  return {
    action: "none",
    newFeedMix: { ...feedMix, probeScores: allProbeScores },
  };
}

export function evaluateDownwardProbe(
  student: { name: string },
  feedMix: FeedMix,
  scores: { score: number; articleLevel: number }[],
  level: number,
): LevelEvalResult {
  const probeLevel = level - 1;
  const probeScores = feedMix.probeScores;

  const recentBaseScores = scores.filter(s => s.articleLevel === level).slice(-3);
  const recentProbeScores = scores.filter(s => s.articleLevel === probeLevel);
  const allProbeScores = [...probeScores, ...recentProbeScores.map(s => s.score)];

  // Recovery: if base-level scores improve (>= 70 on last 2), stop probing down
  const last2Base = recentBaseScores.slice(-2);
  if (last2Base.length >= 2 && last2Base.every(s => s.score >= 70)) {
    return {
      action: "abort_probe",
      newFeedMix: DEFAULT_MIX,
    };
  }

  // Level change: trimmedMean >= 70 with at least 3 probe scores AND base still struggling
  if (allProbeScores.length >= 3) {
    const baseStillStruggling = recentBaseScores.length >= 2 && recentBaseScores.filter(s => s.score < 60).length >= 1;

    if (trimmedMean(allProbeScores) >= 70 && baseStillStruggling) {
      return {
        action: "level_change",
        newLevel: probeLevel,
        newFeedMix: DEFAULT_MIX,
      };
    }
  }

  // Increase mix if probe is going well
  if (feedMix.probePhase === 1 && allProbeScores.length >= 1 && allProbeScores[allProbeScores.length - 1] >= 75) {
    return {
      action: "advance_probe",
      newFeedMix: { ...feedMix, probePhase: 2, probeScores: allProbeScores },
    };
  }

  return {
    action: "none",
    newFeedMix: { ...feedMix, probeScores: allProbeScores },
  };
}
