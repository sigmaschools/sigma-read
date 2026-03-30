export interface NormalizedProfile {
  interests: string[];
}

/**
 * Normalizes any interest profile shape into the canonical form: { interests: string[] }.
 *
 * Handles:
 * - Already correct: {interests: [...]}
 * - Legacy: {primary_interests, secondary_interests, notes?} → merge, deduplicate
 * - topics/categories: {topics, categories} → merge, deduplicate
 * - Flat array: ["interest1", "interest2", ...]
 * - Unknown object with string arrays: merges all string[] values
 * - null/undefined/primitives: returns empty profile
 *
 * Deduplication is case-insensitive; the first occurrence wins.
 */
export function normalizeInterestProfile(raw: unknown): NormalizedProfile {
  if (raw == null || typeof raw !== "object") {
    return { interests: [] };
  }

  // Flat array
  if (Array.isArray(raw)) {
    const strings = raw.filter((v): v is string => typeof v === "string");
    return { interests: dedupe(strings) };
  }

  const obj = raw as Record<string, unknown>;

  // New canonical shape
  if (Array.isArray(obj.interests)) {
    return { interests: dedupe(obj.interests.filter((v): v is string => typeof v === "string")) };
  }

  // Legacy: primary_interests + secondary_interests
  if (Array.isArray(obj.primary_interests)) {
    const primary = obj.primary_interests.filter((v): v is string => typeof v === "string");
    const secondary = Array.isArray(obj.secondary_interests)
      ? obj.secondary_interests.filter((v): v is string => typeof v === "string")
      : [];
    return { interests: dedupe([...primary, ...secondary]) };
  }

  // Legacy: topics/categories
  if (Array.isArray(obj.topics) || Array.isArray(obj.categories)) {
    const topics = Array.isArray(obj.topics)
      ? obj.topics.filter((v): v is string => typeof v === "string")
      : [];
    const categories = Array.isArray(obj.categories)
      ? obj.categories.filter((v): v is string => typeof v === "string")
      : [];
    return { interests: dedupe([...topics, ...categories]) };
  }

  // Unknown object — merge all string arrays
  const allStrings: string[] = [];
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") allStrings.push(item);
      }
    }
  }
  return { interests: dedupe(allStrings) };
}

/** Case-insensitive deduplicate, first occurrence wins. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(item);
    }
  }
  return result;
}
