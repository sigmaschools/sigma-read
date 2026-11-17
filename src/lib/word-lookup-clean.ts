// The word as it will be stored: letters (any alphabet), apostrophes and hyphens, lower case, at most 60 characters.
// The sentence is kept to 500 characters. Null when there is no word left to store.
export function cleanLookup(rawWord: unknown, rawSentence: unknown): { word: string; sentence: string | null } | null {
  if (typeof rawWord !== "string") return null;
  const word = rawWord.replace(/[^\p{L}'-]/gu, "").replace(/^['-]+|['-]+$/g, "").toLowerCase().slice(0, 60);
  if (!word) return null;
  const sentence = typeof rawSentence === "string" ? rawSentence.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  return { word, sentence: sentence || null };
}
