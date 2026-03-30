export interface NormalizedProfile {
  primary_interests: string[];
  secondary_interests: string[];
  notes?: string;
}

/**
 * Normalizes any interest profile shape into the canonical form expected
 * by the morning batch and other consumers.
 *
 * Handles:
 * - Already correct: {primary_interests, secondary_interests, notes?}
 * - topics/categories: {topics, categories}
 * - Flat array: ["interest1", "interest2", ...]
 * - Unknown object with string arrays: merges all string[] values
 * - null/undefined/primitives: returns empty profile
 */
export function normalizeInterestProfile(raw: unknown): NormalizedProfile {
  if (raw == null || typeof raw !== "object") {
    return { primary_interests: [], secondary_interests: [] };
  }

  // Flat array — first 5 primary, rest secondary
  if (Array.isArray(raw)) {
    const strings = raw.filter((v): v is string => typeof v === "string");
    return {
      primary_interests: strings.slice(0, 5),
      secondary_interests: strings.slice(5),
    };
  }

  const obj = raw as Record<string, unknown>;

  // Already canonical shape
  if (Array.isArray(obj.primary_interests)) {
    const result: NormalizedProfile = {
      primary_interests: obj.primary_interests.filter((v): v is string => typeof v === "string"),
      secondary_interests: Array.isArray(obj.secondary_interests)
        ? obj.secondary_interests.filter((v): v is string => typeof v === "string")
        : [],
    };
    if (typeof obj.notes === "string") {
      result.notes = obj.notes;
    }
    return result;
  }

  // topics/categories shape
  if (Array.isArray(obj.topics) || Array.isArray(obj.categories)) {
    return {
      primary_interests: Array.isArray(obj.topics)
        ? obj.topics.filter((v): v is string => typeof v === "string")
        : [],
      secondary_interests: Array.isArray(obj.categories)
        ? obj.categories.filter((v): v is string => typeof v === "string")
        : [],
    };
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
  return {
    primary_interests: allStrings,
    secondary_interests: [],
  };
}
