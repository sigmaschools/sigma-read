// Filters for web search results used by the morning batch.

/** Tag, category and listing pages aren't articles. */
export function isIndexPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (path === "") return true;
    if (/\/(tag|tags|category|categories|author|search)(\/|$)/i.test(path)) return true;
    if (/\/page\/\d+$/i.test(path)) return true;
    // "/topic/octopus" is an article on some sites (Britannica); only a bare "/topics" is a listing
    return /\/(topic|topics|section|sections)$/i.test(path);
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
