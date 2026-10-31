// Filters for web search results used by the morning batch.

/** Tag, category and listing pages aren't articles. */
export function isIndexPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" || /\/(tag|tags|category|categories|topic|topics|section|page|author|search)(\/|$)/i.test(path);
  } catch {
    return true;
  }
}

/** True when the search result's page date is known and older than `days`. Unknown dates pass. */
export function isOlderThan(pageAge: string | null | undefined, days: number, now = Date.now()): boolean {
  if (!pageAge) return false;
  const t = Date.parse(pageAge);
  if (Number.isNaN(t)) return false;
  return now - t > days * 24 * 60 * 60 * 1000;
}
