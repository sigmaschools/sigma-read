/**
 * Map a student's grade level to an initial reading level.
 * This is a starting point — the level progression system calibrates from here.
 *
 * Grade → Level mapping:
 *   Grade 2-3  → L1 (Lexile ~400-500)
 *   Grade 4    → L2 (Lexile ~550-650)
 *   Grade 5-6  → L3 (Lexile ~700-800)
 *   Grade 7    → L4 (Lexile ~850-950)
 *   Grade 8    → L5 (Lexile ~1000-1100)
 *   Grade 9+   → L6 (Lexile ~1150+)
 *   No grade   → L2 (safe default)
 */
export function gradeToReadingLevel(gradeLevel: number | null | undefined): number {
  if (!gradeLevel) return 2;
  if (gradeLevel <= 3) return 1;
  if (gradeLevel <= 4) return 2;
  if (gradeLevel <= 6) return 3;
  if (gradeLevel <= 7) return 4;
  if (gradeLevel <= 8) return 5;
  return 6;
}
