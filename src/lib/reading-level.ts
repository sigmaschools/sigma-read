/**
 * Compass's reading-level measure (app contract section 17, section version 1.0).
 *
 * Compass owns the one estimate of how hard a text is to read, on an approximate Lexile scale.
 * SigmaRead asks it what a writer should aim at for a level, measures every article it writes,
 * and sends an article that landed far from its target back to the writer once.
 *
 * Rules from the contract that this file keeps:
 *   - No copy of the formula, the word list or the sentence splitting lives here (17). When the
 *     measure doesn't answer, the article goes out unmeasured; nothing is estimated locally (17.4).
 *   - Short timeouts, and every call returns null instead of throwing, so the batch never fails
 *     or stalls because the measure is down (17.4).
 *   - One text is good to about 150L: an article is rewritten once, on a reliable result only (17.3).
 *   - The model version is kept with every level (17.3).
 *   - People see the number as approximate (`displayLevel`), never as a Lexile measure (17.3).
 *   - Only text written for students is sent, never a student's own words (17.3).
 */

/** The middle of each SigmaRead level's band, on the same scale the Compass level report uses (compass-report.ts) */
const TARGET_BY_LEVEL: Record<number, number> = { 1: 450, 2: 600, 3: 750, 4: 900, 5: 1050, 6: 1200 };

/** An article this far from its target, or further, is rewritten once */
export const REWRITE_AT = 150;
/** A cached article fits a level when it measured within this much of the level's target */
export const FIT_WITHIN = 100;

const ONE_TEXT_TIMEOUT_MS = 2_000;
const BATCH_TIMEOUT_MS = 5_000;
/** After a failed call, calls are skipped for this long, so an outage costs one timeout and not one per article */
const COOLDOWN_MS = 60_000;
/** Guidance for a level is fetched once and kept this long (a batch is far shorter) */
const GUIDANCE_TTL_MS = 60 * 60_000;
/** Compass takes up to 100 texts a call, 1 MB in all */
export const MEASURE_MAX_TEXTS = 100;
const MEASURE_MAX_CHARS = 700_000;

let downUntil = 0;
const guidanceCache = new Map<number, { at: number; guidance: Guidance }>();

export interface Guidance { modelVersion: string; target: number; summary: string }

export interface Measured {
  /** Absent from Compass when the text has no words; such results are dropped here, so this is always a number */
  level: number;
  modelVersion: string;
  reliable: boolean;
  /** Level less target; above zero the text is harder than wanted. Null when no target was sent */
  difference: number | null;
  /** What to change, in sentences a writer can act on; empty when the text is close to its target */
  advice: string[];
}

/** What is stored with an article: nulls when it went out unmeasured */
export interface StoredLevel { measuredLevel: number | null; levelModelVersion: string | null; levelReliable: boolean | null }

export const UNMEASURED: StoredLevel = { measuredLevel: null, levelModelVersion: null, levelReliable: null };

export function storedLevel(m: Measured | null): StoredLevel {
  return m ? { measuredLevel: m.level, levelModelVersion: m.modelVersion, levelReliable: m.reliable } : UNMEASURED;
}

/** The level an article for SigmaRead level 1-6 is written for */
export function targetForLevel(level: number): number {
  return TARGET_BY_LEVEL[Math.min(6, Math.max(1, Math.round(level)))];
}

/** How a person sees a measured level: always as approximate (contract 17.3) */
export function displayLevel(level: number): string {
  return `${level}L (approximate)`;
}

/** True when the result is a clear miss worth one rewrite: reliable, 150L or more off, with something to act on */
export function needsRewrite(m: Measured | null): boolean {
  return !!m && m.reliable && m.difference !== null && Math.abs(m.difference) >= REWRITE_AT && m.advice.length > 0;
}

/** True when a measured article suits a SigmaRead level; an unmeasured one is judged by its label alone */
export function fitsLevel(measuredLevel: number | null, level: number): boolean | null {
  return measuredLevel === null ? null : Math.abs(measuredLevel - targetForLevel(level)) <= FIT_WITHIN;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export function measureConfigured(): boolean {
  return !!(process.env.COMPASS_URL && process.env.COMPASS_INTERESTS_KEY);
}

async function call<T>(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  if (!measureConfigured() || Date.now() < downUntil) return null;
  const url = process.env.COMPASS_URL!.replace(/\/+$/, "") + "/api/v1/reading-level" + path;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.COMPASS_INTERESTS_KEY}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Compass reading level: ${method} ${path.split("?")[0]} answered ${res.status}`);
      // A refused key (401, 403) won't start working mid-batch either
      if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403) downUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`Compass reading level: ${method} ${path.split("?")[0]} failed: ${e instanceof Error ? e.name : "error"}`);
    downUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}

/** What a writer aims at for a SigmaRead level, or null when Compass doesn't answer. Fetched once per level */
export async function guidanceForLevel(level: number): Promise<Guidance | null> {
  const target = targetForLevel(level);
  const cached = guidanceCache.get(target);
  if (cached && Date.now() - cached.at < GUIDANCE_TTL_MS) return cached.guidance;
  const res = await call<{ modelVersion?: unknown; target?: unknown; summary?: unknown }>("GET", `/guidance?target=${target}`, undefined, ONE_TEXT_TIMEOUT_MS);
  if (!res || typeof res.summary !== "string" || !res.summary.trim()) return null;
  const guidance = { modelVersion: String(res.modelVersion ?? ""), target, summary: res.summary.trim() };
  guidanceCache.set(target, { at: Date.now(), guidance });
  return guidance;
}

interface RawResult {
  level?: unknown; reliable?: unknown;
  target?: { difference?: unknown; advice?: unknown };
}

/** One result from Compass as SigmaRead keeps it; null when it carries no level (a text with no words) */
export function toMeasured(raw: RawResult | undefined, modelVersion: string): Measured | null {
  // A version too long for its column (varchar 20) would fail the article's insert; such a result is not kept
  if (!raw || typeof raw.level !== "number" || !Number.isFinite(raw.level) || !modelVersion || modelVersion.length > 20) return null;
  const difference = typeof raw.target?.difference === "number" ? raw.target.difference : null;
  const advice = Array.isArray(raw.target?.advice) ? raw.target.advice.filter((a): a is string => typeof a === "string" && a.trim() !== "") : [];
  return { level: Math.round(raw.level), modelVersion, reliable: raw.reliable === true, difference, advice };
}

/**
 * Measures Markdown article bodies against their targets. Answers by position, with null for a
 * text that could not be measured; the whole answer is nulls when Compass doesn't answer.
 * Splits into calls of at most 100 texts and well under 1 MB.
 */
export async function measureArticles(texts: { text: string; level: number }[]): Promise<(Measured | null)[]> {
  const out: (Measured | null)[] = texts.map(() => null);
  let start = 0;
  while (start < texts.length) {
    let end = start;
    let chars = 0;
    while (end < texts.length && end - start < MEASURE_MAX_TEXTS && (end === start || chars + texts[end].text.length <= MEASURE_MAX_CHARS)) {
      chars += texts[end].text.length;
      end++;
    }
    const chunk = texts.slice(start, end);
    const res = await call<{ modelVersion?: unknown; results?: RawResult[] }>("POST", "/measure", {
      format: "markdown",
      texts: chunk.map((t, i) => ({ id: String(start + i), text: t.text, target: targetForLevel(t.level) })),
    }, chunk.length === 1 ? ONE_TEXT_TIMEOUT_MS : BATCH_TIMEOUT_MS);
    if (res && Array.isArray(res.results) && res.results.length === chunk.length) {
      const version = typeof res.modelVersion === "string" ? res.modelVersion : "";
      chunk.forEach((_, i) => { out[start + i] = toMeasured(res.results![i], version); });
    }
    start = end;
  }
  return out;
}

export async function measureArticle(text: string, level: number): Promise<Measured | null> {
  return (await measureArticles([{ text, level }]))[0];
}

// ─── Write, measure, rewrite once ─────────────────────────────────────────────

/**
 * Measures a finished article against its level's target. A clear miss goes back to the writer
 * once with Compass's advice, and the closer of the two is kept. When the measure doesn't
 * answer, the article comes back as written, unmeasured.
 */
export async function landOnTarget<T extends { bodyText: string }>(args: {
  level: number;
  article: T;
  /** Rewrites the article with the advice; null when the rewrite failed */
  rewrite: (advice: string[], first: Measured) => Promise<T | null>;
  measure?: (text: string, level: number) => Promise<Measured | null>;
}): Promise<{ article: T; measured: Measured | null; rewritten: boolean }> {
  const measure = args.measure ?? measureArticle;
  const first = await measure(args.article.bodyText, args.level);
  if (!first || !needsRewrite(first)) return { article: args.article, measured: first, rewritten: false };
  const second = await args.rewrite(first.advice, first).catch(() => null);
  if (!second?.bodyText) return { article: args.article, measured: first, rewritten: false };
  const again = await measure(second.bodyText, args.level);
  // Without a second, reliable measurement there is nothing to say the rewrite is closer
  if (!again || !again.reliable || again.difference === null || Math.abs(again.difference) >= Math.abs(first.difference!)) {
    return { article: args.article, measured: first, rewritten: false };
  }
  return { article: second, measured: again, rewritten: true };
}

/** For tests */
export function resetReadingLevelState() {
  downUntil = 0;
  guidanceCache.clear();
}
