/**
 * Validation for admin edits to a student's reading settings (PATCH /api/admin/students/[id]).
 * Who the student is (name, grade) comes from Compass and is not edited here.
 * Pure, so it can be tested without a database.
 */

export interface StudentUpdate {
  dailyArticleCap?: number;
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

  const fields: [keyof StudentUpdate, number, number, boolean][] = [
    ["dailyArticleCap", 1, 20, false],
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
