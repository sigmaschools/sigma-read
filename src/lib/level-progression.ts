/**
 * Gradual Mix Level Progression System
 * 
 * Instead of binary level changes, we gradually mix in content at adjacent levels
 * and let the student's performance on that content be the proof.
 * 
 * See docs/level-progression.md for full design rationale.
 */

import { db, schema } from "@/lib/db";
import { eq, desc, and, isNotNull } from "drizzle-orm";

interface FeedMix {
  probeDirection: "up" | "down" | null;
  probePhase: number;
  probeStartDate: string | null;
  probeScores: number[];
}

interface LevelEvalResult {
  action: "none" | "start_probe_up" | "start_probe_down" | "advance_probe" | "abort_probe" | "level_change" | "confidence_boost" | "guide_alert";
  newFeedMix?: FeedMix;
  newLevel?: number;
  alertMessage?: string;
}

const DEFAULT_MIX: FeedMix = { probeDirection: null, probePhase: 0, probeStartDate: null, probeScores: [] };

/**
 * Determine student tier based on reading level.
 * Younger (L1-L2, grades 2-4): more evidence needed, faster struggle response
 * Older (L3-L6, grades 5-8): more stable signals
 */
function getTier(level: number): "younger" | "older" {
  return level <= 2 ? "younger" : "older";
}

/**
 * Get recent comprehension scores for a student.
 * Returns scores in chronological order (oldest first).
 */
async function getRecentScores(studentId: number, count: number): Promise<{ score: number; articleLevel: number }[]> {
  const results = await db.select({
    score: schema.comprehensionReports.score,
    articleLevel: schema.articles.readingLevel,
  })
    .from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.comprehensionReports.conversationId))
    .innerJoin(schema.readingSessions, eq(schema.readingSessions.id, schema.conversations.readingSessionId))
    .innerJoin(schema.articles, eq(schema.articles.id, schema.readingSessions.articleId))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.comprehensionReports.createdAt))
    .limit(count);

  return results.reverse(); // oldest first
}

/**
 * Count sessions since last level change (or since onboarding if no changes).
 */
async function sessionsSinceLastChange(studentId: number): Promise<number> {
  const [lastChange] = await db.select({ changedAt: schema.levelHistory.changedAt })
    .from(schema.levelHistory)
    .where(eq(schema.levelHistory.studentId, studentId))
    .orderBy(desc(schema.levelHistory.changedAt))
    .limit(1);

  if (!lastChange) {
    // Count all sessions
    const scores = await getRecentScores(studentId, 100);
    return scores.length;
  }

  // Count sessions after last change
  const results = await db.select({ id: schema.readingSessions.id })
    .from(schema.readingSessions)
    .innerJoin(schema.conversations, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .innerJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .where(and(
      eq(schema.readingSessions.studentId, studentId),
    ))
    .orderBy(desc(schema.readingSessions.startedAt));

  // Filter by date in JS since drizzle gte on timestamps can be tricky
  return results.filter(r => true).length; // simplified — count all for now
}

/**
 * Evaluate a student's recent performance and determine what action to take.
 * Called after each comprehension report is generated.
 */
export async function evaluateProgression(studentId: number): Promise<LevelEvalResult> {
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return { action: "none" };

  const level = student.readingLevel || 2;
  const tier = getTier(level);
  const feedMix: FeedMix = (student.feedMix as FeedMix) || DEFAULT_MIX;
  const scores = await getRecentScores(studentId, 8);

  // Grace period: first 3 sessions, no evaluation
  if (scores.length < 3) return { action: "none" };

  // Cooldown: 3 sessions after level change
  const [lastChange] = await db.select().from(schema.levelHistory)
    .where(eq(schema.levelHistory.studentId, studentId))
    .orderBy(desc(schema.levelHistory.changedAt))
    .limit(1);

  if (lastChange) {
    const sessionsAfterChange = scores.filter(s => true).length; // all scores are after DB query
    // Simple cooldown: if last change was very recent, skip
    const hoursSinceChange = (Date.now() - new Date(lastChange.changedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceChange < 1 && scores.length <= 3) return { action: "none" };
  }

  // === CURRENTLY PROBING ===
  if (feedMix.probeDirection === "up") {
    return evaluateUpwardProbe(student, feedMix, scores, level, tier);
  }
  if (feedMix.probeDirection === "down") {
    return evaluateDownwardProbe(student, feedMix, scores, level, tier);
  }

  // === NOT PROBING — CHECK IF WE SHOULD START ===

  // Check for upward probe trigger
  if (level < 6) {
    const upTrigger = checkUpwardTrigger(scores, tier);
    if (upTrigger) {
      return {
        action: "start_probe_up",
        newFeedMix: {
          probeDirection: "up",
          probePhase: 1,
          probeStartDate: new Date().toISOString(),
          probeScores: [],
        },
      };
    }
  }

  // Check for downward probe trigger (faster response)
  if (level > 1) {
    const downTrigger = checkDownwardTrigger(scores, tier);
    if (downTrigger) {
      return {
        action: "start_probe_down",
        newFeedMix: {
          probeDirection: "down",
          probePhase: 1,
          probeStartDate: new Date().toISOString(),
          probeScores: [],
        },
      };
    }
  }

  // L1 floor protection
  if (level === 1) {
    const last4 = scores.slice(-4);
    const below50 = last4.filter(s => s.score < 50).length;
    if (below50 >= 3) {
      return {
        action: "guide_alert",
        alertMessage: `${student.name.split(" ")[0]} may need additional reading support beyond SigmaRead`,
      };
    }
  }

  return { action: "none" };
}

function checkUpwardTrigger(scores: { score: number }[], tier: "younger" | "older"): boolean {
  if (tier === "younger") {
    // 4 of last 5 scores ≥ 85
    const last5 = scores.slice(-5);
    if (last5.length < 5) return false;
    return last5.filter(s => s.score >= 85).length >= 4;
  } else {
    // 3 of last 4 scores ≥ 90
    const last4 = scores.slice(-4);
    if (last4.length < 4) return false;
    return last4.filter(s => s.score >= 90).length >= 3;
  }
}

function checkDownwardTrigger(scores: { score: number }[], tier: "younger" | "older"): boolean {
  if (tier === "younger") {
    // 2 consecutive scores < 60
    const last2 = scores.slice(-2);
    if (last2.length < 2) return false;
    return last2.every(s => s.score < 60);
  } else {
    // 2 of last 3 scores < 55
    const last3 = scores.slice(-3);
    if (last3.length < 3) return false;
    return last3.filter(s => s.score < 55).length >= 2;
  }
}

function evaluateUpwardProbe(
  student: any,
  feedMix: FeedMix,
  scores: { score: number; articleLevel: number }[],
  level: number,
  tier: "younger" | "older"
): LevelEvalResult {
  const probeLevel = level + 1;
  const probeScores = feedMix.probeScores;

  // Check if student has scored on any probe-level articles recently
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

  // Phase 1 → Phase 2: 2 of first 3 probe scores ≥ 80
  if (feedMix.probePhase === 1 && allProbeScores.length >= 2) {
    const passing = allProbeScores.filter(s => s >= 80).length;
    if (passing >= 2) {
      return {
        action: "advance_probe",
        newFeedMix: { ...feedMix, probePhase: 2, probeScores: allProbeScores },
      };
    }
  }

  // Phase 2 → Level change: 3 of first 4 probe scores ≥ 80
  if (feedMix.probePhase === 2 && allProbeScores.length >= 3) {
    const passing = allProbeScores.filter(s => s >= 80).length;
    if (passing >= 3) {
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

function evaluateDownwardProbe(
  student: any,
  feedMix: FeedMix,
  scores: { score: number; articleLevel: number }[],
  level: number,
  tier: "younger" | "older"
): LevelEvalResult {
  const probeLevel = level - 1;
  const probeScores = feedMix.probeScores;

  const recentBaseScores = scores.filter(s => s.articleLevel === level).slice(-3);
  const recentProbeScores = scores.filter(s => s.articleLevel === probeLevel);
  const allProbeScores = [...probeScores, ...recentProbeScores.map(s => s.score)];

  // Recovery: if base-level scores improve (≥ 70 on last 2), stop probing down
  const last2Base = recentBaseScores.slice(-2);
  if (last2Base.length >= 2 && last2Base.every(s => s.score >= 70)) {
    return {
      action: "abort_probe",
      newFeedMix: DEFAULT_MIX,
    };
  }

  // Level change: 3 of 4 probe scores show clear improvement (≥ 75) AND base still struggling
  if (allProbeScores.length >= 3) {
    const probeSuccess = allProbeScores.filter(s => s >= 75).length;
    const baseStillStruggling = recentBaseScores.length >= 2 && recentBaseScores.filter(s => s.score < 60).length >= 1;

    if (probeSuccess >= 3 && baseStillStruggling) {
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

/**
 * Apply the result of evaluateProgression to the database.
 */
export async function applyProgressionResult(studentId: number, result: LevelEvalResult): Promise<void> {
  if (result.newFeedMix) {
    await db.update(schema.students)
      .set({ feedMix: result.newFeedMix })
      .where(eq(schema.students.id, studentId));
  }

  if (result.newLevel) {
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
    const oldLevel = student?.readingLevel || 2;

    await db.update(schema.students)
      .set({ readingLevel: result.newLevel, feedMix: DEFAULT_MIX })
      .where(eq(schema.students.id, studentId));

    await db.insert(schema.levelHistory).values({
      studentId,
      fromLevel: oldLevel,
      toLevel: result.newLevel,
    });
  }
}

/**
 * Determine the article level mix for serving articles.
 * Returns an array of levels to serve (e.g., [3, 3, 4] for phase 1 upward probe at L3).
 */
export function getServingLevels(baseLevel: number, feedMix: FeedMix | null, count: number = 3): number[] {
  const mix = feedMix || DEFAULT_MIX;

  if (!mix.probeDirection) {
    // Normal: all at base level
    return Array(count).fill(baseLevel);
  }

  const probeLevel = mix.probeDirection === "up" ? baseLevel + 1 : baseLevel - 1;

  if (mix.probePhase === 1) {
    // Phase 1: 1 probe article
    const levels = Array(count).fill(baseLevel);
    levels[count - 1] = probeLevel; // last article is the probe
    return levels;
  }

  if (mix.probePhase === 2) {
    // Phase 2: 2 probe articles
    const levels = Array(count).fill(probeLevel);
    levels[0] = baseLevel; // first article stays at base
    return levels;
  }

  // Phase 3 or fallback
  return Array(count).fill(baseLevel);
}
