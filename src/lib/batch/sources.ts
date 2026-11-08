// Where the morning batch looks for source pages.
//
// Every list here is searched with Anthropic's web search tool restricted to its domains
// (`allowed_domains` also covers subdomains). Pages must be free to read without a login or
// script: the batch fetches plain HTML. Paywalled or closed sites were dropped: Newsela
// (paywall; its search hits were company blog posts), TweenTribune (closed), DK Find Out (closed).

/** Free news sites written for kids. First stop for the daily news article. */
export const KID_NEWS_DOMAINS = [
  "snexplores.org", // Science News Explores (was Science News for Students)
  "dogonews.com",
  "newsforkids.net",
  "youngzine.org",
  "timeforkids.com",
];

/** Reliable general news on science, nature, space and discovery, for when kid sites have nothing new. */
export const NEWS_DOMAINS = [
  ...KID_NEWS_DOMAINS,
  "smithsonianmag.com",
  "nasa.gov",
  "sciencenews.org",
  "nationalgeographic.com",
  "livescience.com",
  "noaa.gov",
];

/** Explainer and feature sites for interest and horizon articles, as an alternative to Grokipedia. */
export const EXPLAINER_DOMAINS = [
  "kids.frontiersin.org", // scientists writing for kids
  "snexplores.org",
  "natgeokids.com",
  "ducksters.com",
  "wonderopolis.org",
  "howstuffworks.com",
  "britannica.com",
  "smithsonianmag.com",
  "nasa.gov",
  "livescience.com",
  "history.com",
];

/**
 * Topic searches for news when the kid sites have nothing recent. `science` topics suit the
 * science and nature news sites (NEWS_DOMAINS); the rest are only searched on the open web.
 */
export const NEWS_TOPICS: { query: string; science: boolean }[] = [
  { query: "new scientific discovery", science: true },
  { query: "world record sports achievement", science: false },
  { query: "new animal species discovered", science: true },
  { query: "NASA space mission", science: true },
  { query: "new technology invention", science: true },
  { query: "extreme weather event", science: true },
  { query: "young person achievement", science: false },
  { query: "archaeological discovery", science: true },
  { query: "ocean exploration discovery", science: true },
  { query: "new dinosaur fossil discovery", science: true },
  { query: "robotics competition", science: false },
  { query: "renewable energy milestone", science: true },
  { query: "international sports tournament results", science: false },
  { query: "national park or wildlife", science: true },
  { query: "medical breakthrough", science: true },
];

/**
 * Where a story angle (story-angles.ts) is searched for first: the explainer sites plus the
 * kids' news sites, which carry stories by nature. Grokipedia is the last resort, and only a
 * page about the story itself; the open web comes in between.
 */
export const STORY_DOMAINS = [...new Set([...EXPLAINER_DOMAINS, ...KID_NEWS_DOMAINS])];

/** A Grokipedia `/page/...` link that is a real page, not a script template caught by the link scan */
export function isGrokipediaPagePath(path: string): boolean {
  // Apostrophes stay ("Newton's_laws_of_motion"); the template has spaces
  return /^\/page\/[^\s"<>]+$/.test(path);
}

/**
 * The day's plans to source, at most `articlesNeeded` articles. News plans are fallbacks for one
 * article (sourcing stops at the first good page), so they all go in, and one slot is kept for
 * news when `needNews` (no news article yet today). Interest and horizon plans fill the rest.
 * Before this, interests filled the target first and only one news search ran, so a single
 * rejected page meant no news that day.
 */
export function plansToRun<P extends { type: "interest" | "news" | "horizon" }>(plans: P[], articlesNeeded: number, needNews: boolean): P[] {
  if (articlesNeeded <= 0) return [];
  const topics = plans.filter(p => p.type !== "news");
  const news = needNews ? plans.filter(p => p.type === "news") : [];
  const topicSlots = Math.max(0, articlesNeeded - (news.length > 0 ? 1 : 0));
  return [...topics.slice(0, topicSlots), ...news];
}
