/**
 * Validation for admin edits to a student (PATCH /api/admin/students/[id]).
 * Pure, so it can be tested without a database.
 */

export interface StudentUpdate {
  name?: string;
  guideId?: number;
  gradeLevel?: number | null;
  age?: number | null;
  dailyArticleCap?: number;
  /** null means auto (dailyArticleCap × 5) */
  weeklySessionTarget?: number | null;
  /** Handled separately: resets the feed mix and writes level history */
  readingLevel?: number;
}

type Result = { ok: true; update: StudentUpdate } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Integer within [min, max]; null allowed when nullable */
function intField(body: Record<string, unknown>, key: string, min: number, max: number, nullable: boolean): number | null | undefined | Error {
  if (!(key in body) || body[key] === undefined) return undefined;
  const v = body[key];
  if (v === null || v === "") return nullable ? null : new Error(`${key} is required`);
  if (!isInt(v) || v < min || v > max) return new Error(`${key} must be a whole number from ${min} to ${max}`);
  return v;
}

export function parseStudentUpdate(body: unknown): Result {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const update: StudentUpdate = {};

  if ("name" in b && b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) return { ok: false, error: "name must not be empty" };
    if (b.name.trim().length > 100) return { ok: false, error: "name is too long" };
    update.name = b.name.trim();
  }

  const fields: [keyof StudentUpdate, number, number, boolean][] = [
    ["guideId", 1, 2_147_483_647, false],
    ["gradeLevel", 0, 12, true],
    ["age", 4, 18, true],
    ["dailyArticleCap", 1, 20, false],
    ["weeklySessionTarget", 1, 100, true],
    ["readingLevel", 1, 6, false],
  ];
  for (const [key, min, max, nullable] of fields) {
    const v = intField(b, key, min, max, nullable);
    if (v instanceof Error) return { ok: false, error: v.message };
    if (v !== undefined) (update as Record<string, unknown>)[key] = v;
  }

  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update" };
  return { ok: true, update };
}
