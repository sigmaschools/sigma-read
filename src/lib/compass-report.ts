/**
 * Report blocks Compass reads from the page (Compass app contract 0.2, section 2.2 "Reports").
 * Compass's page agent parses `<script type="application/json" data-compass-report>` blocks,
 * so the field names here are fixed by the contract: don't rename them.
 *
 * Pure functions only (no DB), so they can be tested with plain asserts.
 * No student name, email or other personal details go into a report.
 */

/**
 * Sigma Read places students in six reading levels, not exact Lexile measures.
 * Each level is reported as the middle of its Lexile band (see levelGuide in src/lib/prompts):
 * L1 ~400-500, L2 ~550-650, L3 ~700-800, L4 ~850-950, L5 ~1000-1100, L6 ~1150+.
 */
const LEXILE_BY_LEVEL: Record<number, number> = { 1: 450, 2: 600, 3: 750, 4: 900, 5: 1050, 6: 1200 };

/** Lexile for a Sigma Read level, as a whole number (850 means 850L; Beginning Reader would be negative). */
export function levelToLexile(level: number): number {
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  return LEXILE_BY_LEVEL[clamped];
}

/** The build this report came from (contract 2.3) */
export function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
}

export interface LevelReport {
  kind: "level";
  value: number;
  setAt: string;
  history: { value: number; setAt: string }[];
  appVersion: string;
}

/**
 * The `level` report.
 * - `value`: current Lexile; `setAt`: when it last changed.
 * - `history`: every earlier level with the time it took effect, oldest first.
 * `changes` are level_history rows; the first level took effect at `firstSetAt`
 * (when the student was created: the level set at onboarding has no history row).
 */
export function buildLevelReport(args: {
  currentLevel: number;
  firstSetAt: Date;
  changes: { fromLevel: number; toLevel: number; changedAt: Date }[];
}): LevelReport {
  const changes = [...args.changes].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  // Each level the student has had, with when it took effect
  const levels: { value: number; setAt: string }[] = [];
  if (changes.length > 0) {
    levels.push({ value: levelToLexile(changes[0].fromLevel), setAt: args.firstSetAt.toISOString() });
    for (const c of changes) levels.push({ value: levelToLexile(c.toLevel), setAt: c.changedAt.toISOString() });
  }
  const current = levelToLexile(args.currentLevel);
  const last = levels[levels.length - 1];
  // The current level is normally the last change; if something set it without a history row,
  // every recorded level is earlier and the last change is the best time we have
  const setAt = last?.setAt ?? args.firstSetAt.toISOString();
  const history = last && last.value === current ? levels.slice(0, -1) : levels;
  return { kind: "level", value: current, setAt, history, appVersion: appVersion() };
}

export interface ComprehensionCompassReport {
  kind: "comprehension";
  article: string;
  words: number;
  overall: number;
  skills: Record<string, string>;
  selfRating: string | null;
  finishedAt: string | null;
  articleLexile: number;
  levelBefore: number;
  levelAfter: number;
  appVersion: string;
}

/** The `comprehension` report shown when a discussion ends. */
export function buildComprehensionReport(args: {
  articleTitle: string;
  articleText: string;
  articleLevel: number;
  score: number;
  skills: Record<string, string> | null;
  selfAssessment: string | null;
  finishedAt: Date | null;
  /** Sigma Read levels before and after this discussion's level progression; null on reports saved before these were stored */
  levelBefore: number | null;
  levelAfter: number | null;
  /** Fallback when the report predates stored levels */
  currentLevel: number;
}): ComprehensionCompassReport {
  const before = args.levelBefore ?? args.currentLevel;
  const after = args.levelAfter ?? before;
  return {
    kind: "comprehension",
    article: args.articleTitle,
    words: args.articleText.split(/\s+/).filter(w => w.length > 0).length,
    overall: args.score,
    skills: args.skills ?? {},
    selfRating: args.selfAssessment,
    finishedAt: args.finishedAt ? args.finishedAt.toISOString() : null,
    articleLexile: levelToLexile(args.articleLevel),
    levelBefore: levelToLexile(before),
    levelAfter: levelToLexile(after),
    appVersion: appVersion(),
  };
}

/** JSON for inside a <script> tag: `<` escaped so text like "</script>" in a title can't end the block. */
export function reportJson(report: object): string {
  return JSON.stringify(report).replace(/</g, "\\u003c");
}
