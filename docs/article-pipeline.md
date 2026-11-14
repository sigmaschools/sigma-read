# SigmaRead Article Pipeline — Technical Specification

*Last updated: February 8, 2026*

This document specifies the technical implementation of article generation, selection, and delivery. It implements the principles defined in [Content Selection Policy](./content-policy.md). The policy document is authoritative; this document describes how.

---

## Architecture Overview

```
[Morning Batch Cron - 5 AM CT]
        │
        ▼
[News Headlines] ──→ [Topic Planning] ──→ [Base Article Generation (writer)]
        │                                           │
        ▼                                           ▼
[Student Interests]              [Level Adaptation (writer)] ──→ [Article Cache]
[Reading History]                        │
[Domain Balance]                         ▼
                                 [Student Buffers] ──→ [Student Feed]
```

### Components

1. **Morning Batch Job** — Daily cron at 5 AM CT generates the day's article pool
2. **Article Cache** — Shared pool of articles at all reading levels
3. **Student Buffer** — 12 unread articles per student, served 3 at a time
4. **Serve Logic** — Selects from buffer respecting daily mix ratios
5. **Feedback Collection** — Favorites, ratings, "show me different" clicks feed back into future selection

---

## Morning Batch Process

**Schedule:** Daily, 5:00 AM CT
**Code:** `src/lib/batch/morning-batch.ts`, run by Vercel Cron through `/api/cron/morning-batch` (manual runs: `npx tsx scripts/morning-batch.ts`)
**Runtime:** ~5-10 minutes for 50 students

### Step 1: Sourcing

Every article tells one specific story, written from one real page where a fitting page exists. Site lists live in `src/lib/batch/sources.ts`; searches use the Anthropic API's server-side web search tool restricted to those sites (no separate key). Every page, Grokipedia's included, passes the content filter before use.

**News (1 a day).** Candidates are tried in order until one page passes the content filter and the duplicate check:
1. Kid news sites, last 14 days (Science News Explores, DOGOnews, News for Kids, Youngzine, TIME for Kids)
2. Two random kid-safe topics ("new animal species discovered", "NASA space mission", ...); the science ones are searched on reliable science and nature news sites (the kid sites plus Smithsonian, NASA, Science News, National Geographic, Live Science, NOAA), last 7 days
3. The same two topics on the open web, last 7 days

Age limits use the search result's page date; pages with no date pass, so recency is a preference, not a guarantee.

The news slot is kept even when interest articles fill the day's target. Before 2026-11-06 only one news search ran per day and a rejected page ended it, so no news was written from 2026-11-01 to 2026-11-05 (the one search that day hit a Newsela company blog post). Newsela (paywalled) and TweenTribune (closed) were dropped.

**Interest and horizon (since 2026-11-09).** An interest is a subject ("airsoft", "animals"); kids don't read subjects, they read stories. So each interest first becomes a few specific story angles (`src/lib/batch/story-angles.ts`, the writer model): "how a hop-up makes a BB fly farther", "the bird that sleeps mid-flight", each with a search query. Recent article titles are passed in so the angles are new. For each story in turn the batch looks for a page on the kids' explainer and news sites (Frontiers for Young Minds, Science News Explores, Nat Geo Kids, Ducksters, Wonderopolis, HowStuffWorks, Britannica, Smithsonian, NASA, Live Science, History.com, the kid news sites), then on the open web, then for a specific Grokipedia page about the story. A general overview page on the whole subject (Grokipedia's "Animal", "Cooking") is never used: from 2026-10-29 to 2026-11-08 it was the first choice, and it produced the generic encyclopedia rewrites that lost students.

When no page about any of the stories can be found, the first story that isn't already in the pool (duplicate check) is written from the model's own knowledge (`writeFromKnowledge` in `article-writer.ts`, confident facts only, no invented quotes or numbers). The finished text goes through the content filter, since no page did, and the article carries a `review_note`, shown as a "check facts" badge in the admin article queue; clicking the badge clears it once an admin has checked the facts. `ARTICLE_KNOWLEDGE_FALLBACK=off` turns the fallback off, so the interest gets nothing that day instead.

The content filter (`filterSources` in `morning-batch.ts`, the standard model) rejects pages that are mainly about the blocklist topics in [content-safety.md](./content-safety.md), pages that aren't articles (homepages, company blogs, product pages), and pages with no story in them (an overview or definition of a whole subject, a list of types). A second check (`onTopicResults`) drops search results that only share a name with the story (a film, a team, a company).

### Step 2: Topic Planning

`planDailyArticles` in `morning-batch.ts` builds the day's plan from each student:

- **Interests.** Each active student's three least-recently-featured interests (`interest_rotation` keeps the dates), all of them. Every student's first interest is written before anyone's second, and an interest several students share is written once (`src/lib/batch/plan-interests.ts`). There is no cap on the count: the user's standing decision (2026-11-08) is to pay for specific, personal articles rather than save with a shared set of broad ones, which is what the Oct 29 to Nov 8 planner did (fewest articles covering the most students).
- **News.** One article a day from the candidates in Step 1.
- **Horizon.** One topic next to a student's interests that they haven't shown a view on, from the interest graph (or model-suggested adjacent interests for students without graph data), drawn at random so no one student's list decides every day.

Articles go into the shared pool and are served to every student who has the interest ([article-selection.md](./article-selection.md)). Each story is sourced, written and adapted to every level in turn (news first), so a run that hits its time limit keeps every article it finished. The last 150 seconds of a run's budget are kept for adapting leftovers and serving, so students get articles every run. The next cron tick plans again without the interests already in today's `interest_rotation` (an interest counts as done for the day once tried, written or not), today's horizon article and, if there is one, today's news, and carries on. An interest whose story angles couldn't be generated (a failed model call) is skipped for the run, not written as a generic article, and tried again next run. The order above decides what gets written first.

### Step 3: Base Article Generation

- **Model:** `MODELS.writer` in `src/lib/models.ts` (see [ai-models.md](./ai-models.md) for the choice and its test). Prompts live in `src/lib/batch/article-writer.ts`, shared by the batch, new students' first articles and `npm run eval:articles`.
- **Level:** Generated at L4 (Grade 7) as the base
- **Count:** every planned interest (up to 3 per student, shared interests once) + 1 news + 1 horizon; no cap
- **Brief:** the writer gets the story angle ("tell ONE story") and the source page as its fact-check, not its outline; every fact, number, name and date comes from the source. Without a source it writes from its own knowledge and the article is marked for review (Step 1)
- **Prompt:** Includes editorial neutrality rules, vocabulary constraints, word count targets

### Step 4: Level Adaptation

Each base article is adapted to all reading levels needed by active students.

- **Model:** `MODELS.writer`, same as the base article (each article is written once for every student, so the writer's cost is small next to the conversations)
- **Process:** Adjust vocabulary, sentence complexity, word count, detail level
- **Quality:** Same facts, different expression. Title may be simplified for lower levels.

Level specifications:

| Level | Grade | Lexile | Words | Vocabulary |
|---|---|---|---|---|
| L1 | 2-3 | 400-500 | 100-200 | Simple, common words. Define topic words in-sentence. |
| L2 | 3-4 | 550-650 | 200-300 | Mostly common. 1-2 topic words per paragraph, explained. |
| L3 | 5-6 | 700-800 | 300-400 | 2-3 challenging words per paragraph, contextually clear. |
| L4 | 7 | 850-950 | 400-500 | Domain vocabulary with context clues. |
| L5 | 8 | 1000-1100 | 400-600 | Domain-specific with context. Complex structures. |
| L6 | 8+ | 1150+ | 500-600 | Advanced vocabulary. Nuance and inference. |

### Reading-level check

Every article, base or adapted, is checked against its level's target with Compass's reading-level measure ([compass-integration.md](./compass-integration.md#7-the-reading-level-measure), `src/lib/reading-level.ts`). The target is the middle of the level's Lexile band: 450, 600, 750, 900, 1050, 1200.

1. **Before writing**, the batch asks Compass what to aim at for the level (about 9 words a sentence at 500L, 11 at 700L, 14 at 900L, 18 at 1100L, plus how common the words should be) and puts that sentence in the writer's prompt. It is fetched once per level.
2. **After writing**, the article is measured. Its level, the model version and whether the result was reliable are stored on the row (`measured_level`, `level_model_version`, `level_reliable`).
3. **A clear miss is rewritten once.** When a reliable result is 150L or more from the target, the writer gets the article back with Compass's advice (`reviseArticle`: same story, same facts, only sentences and word choices change, title kept). The rewrite is measured, and the closer of the two is kept. There is never a second rewrite: one text is only good to about 150L, so chasing the number further would be chasing noise. An article written from the model's own knowledge goes through the content check after this, so the check reads the text that is stored.
4. **When Compass doesn't answer** (not configured, an error, or no answer in a few seconds), the article goes out as written with no level stored, and the prompt is what it was before the measure existed. After one failed call the batch stops asking for a minute, so an outage costs one short wait and not one per article. Each run, after serving (so students never wait on it), `measureUnmeasured` measures cached articles that have no level or one from an older model version (up to 300 a run; nothing is rewritten there).

Markdown lists are left out of the measure by Compass, so an article that is mostly a list may come back as not reliable; it is stored that way and never rewritten on that result. The measured level is shown to admins only, as approximate: hover a level on the Articles page.

**Serving.** Articles are still matched to students by their level label (1-6). Within that, the fill of a student's feed uses articles that measured within about 100L of the level's target first (`pickFitFirst`); an unmeasured article counts as fitting, and one that measured further off is used only when the others run out, so the measure never leaves a student with fewer articles. Stories written for the student's own interests are served regardless: they were measured and, if far off, rewritten when they were written.

### Step 5: Buffer Fill

For each active student:
1. Check current unread count
2. If below 12 (buffer target), serve new articles from cache
3. Select articles the student has never seen (tracked via `student_article_history`): neither the same title nor the same base article at another level (adapted titles can differ)
4. Respect daily mix ratios (see Article Mix below)

### Sharing and duplicates

The article pool is shared. One base article, adapted to each level, serves every student who has that interest, so students with the same interest get the same article and it is written once.

Nothing on the same subject is written twice. Before a source is rewritten, `findDuplicate` (`src/lib/batch/dedup.ts`) compares its page title and opening with the base articles of the last 60 days: first a title-overlap check, then a light-model check for "same subject, same angle" (a different angle on a familiar subject is allowed). A duplicate source is skipped, which costs one small call instead of a rewrite. This covers:

- the batch's own picks on the same day (two interests landing on one page, an interest and the news);
- new students' first articles (`writeInterestArticle`): when the pool already has the subject, the existing article is served at the student's level (adapted if that level is missing) instead of writing another. Their articles are written in parallel, so source URLs being written are claimed in memory and not picked twice. Before this, two interests such as a company and its products could both land on the company's page and produce two near-identical articles in one morning.

Serving never gives a student the same base article twice, at any level.

### Per-student repeats and topic spacing

The pool check allows a new angle on a familiar subject, which is right for the pool, but one student can still meet two articles that tell the same story. A student read "How Cooking Changed Humanity Forever" on 2026-11-04 and was served "The Ancient Art of Smoking Food" on 2026-11-05: both open with early humans and fire, cite the same 780,000-year-old site in Israel and retell the same Egyptian, medieval and Chinese history.

So serving (the feed top-up in `/api/articles/serve-cached` and the morning batch's serve step) also checks its picks against the student's articles from the last 30 days, at most the 40 newest (`src/lib/repeats.ts`): a title-overlap check, then one light-model call on titles and excerpts (the opening plus a few later sentences with numbers or dates, since a retold story shares those facts even when the openings differ) asking whether the student would feel it is the same article again (same subject, or the same story under a new name). Repeats are re-picked and never served, and a replacement is also compared with the rest of that serving; a slot can stay empty rather than serve one. The call has a 6-second limit; if it fails or times out, only the title check applies (logged as "Repeat check failed"). Measure the prompt with `npm run eval:repeats` (fixed cases in `scripts/eval/repeat-cases.json`).

Topics served in the last 2 days are avoided when anything else is left, so one interest doesn't fill the feed day after day (the same student had three cooking articles in two days).

---

## Daily Article Mix

Per student per day (target ratios):

| Type | Count | Selection Logic |
|---|---|---|
| Current events (Bucket 1) | 4-5 | From today's batch headlines |
| Interest-matched | 3-4 | From student's interest profile |
| Horizon-expanding | 2-3 | Adjacent to interests, new domain |
| Civic literacy (Bucket 2) | 0-1 | Only when genuinely significant |

*Note: Current implementation serves from a shared pool without per-student interest matching. The mix ratios will be implemented in the topic planning step (Step 2 enhancement).*

---

## Data Model

### Article Cache (`article_cache`)

Shared pool of all generated articles.

| Column | Type | Purpose |
|---|---|---|
| id | serial | Primary key |
| title | text | Article title |
| topic | text | Topic tag |
| body_text | text | Full article text |
| reading_level | int | 1-6 |
| sources | jsonb | Source URLs/names |
| estimated_read_time | int | Minutes |
| category | varchar(20) | news, general, interest, civic |
| base_article_id | int | Links adaptations to their base (null for base articles) |
| generated_date | date | Which batch date produced this |
| headline_source | text | Source URL for news articles |
| measured_level | int | Compass's estimate of the article's reading level (approximate Lexile); null when unmeasured |
| level_model_version | varchar(20) | The version of Compass's measure that made the estimate |
| level_reliable | boolean | False when Compass flagged the result (very short text, mostly lists) |
| created_at | timestamp | Creation time |

### Student Articles (`articles`)

Per-student article feed — copies served from the cache.

| Column | Type | Purpose |
|---|---|---|
| id | serial | Primary key |
| student_id | int | FK to students |
| title, topic, body_text, etc. | — | Copied from cache |
| read | boolean | Has student opened this article |
| liked | boolean | Student's like/dislike reaction |
| source_cache_id | int | Links back to the cache article |
| created_at | timestamp | When served to student |

### Student Article History (`student_article_history`)

Prevents any student from ever seeing the same article twice.

| Column | Type | Purpose |
|---|---|---|
| student_id | int | FK to students |
| article_cache_id | int | Which cache article was served |
| article_title | text | Denormalized for fast lookup |
| served_at | timestamp | When it was served |

### Article Feed Events (`article_feed_events`)

Tracks student interactions with the article feed.

| Column | Type | Purpose |
|---|---|---|
| student_id | int | FK to students |
| event_type | varchar(30) | `show_me_different`, `interest_suggestion`, etc. |
| metadata | jsonb | Event-specific data |
| created_at | timestamp | When it happened |

### Article Favorites (`article_favorites`)

Daily favorite picks at goal completion.

| Column | Type | Purpose |
|---|---|---|
| student_id | int | FK to students |
| article_id | int | FK to articles |
| created_at | timestamp | When picked |

### Article Ratings (`article_ratings`)

Periodic article quality ratings (every 20th session).

| Column | Type | Purpose |
|---|---|---|
| student_id | int | FK to students |
| rating | varchar(20) | love, okay, not_great, bad |
| feedback_text | text | Optional free-text (prompted on negative ratings) |
| created_at | timestamp | When submitted |

---

## Student Experience Flow

### Daily Reading Session

1. Student opens SigmaRead → sees 3 unread articles
2. "Show me different articles" swaps the 3 shown (pulls from buffer of 12)
3. Student picks an article → reads → discusses → self-assesses
4. Repeat until daily goal (3) is reached
5. Goal completion experience triggers (see below)
6. Can continue reading up to daily cap (5, adjustable)

### Goal Completion Experience

When a student reaches their daily reading goal:

1. **Summary card** — "Nice work today! Today you explored [article titles]."
2. **Favorite pick** — "What was your favorite article today?" (one tap, saves to `article_favorites`)
3. **Interest prompt** — "Is there anything you want to read about tomorrow?" (optional text input, saves as `interest_suggestion` feed event)
4. **Rating prompt** (every 20th session) — "How are the articles we're picking for you?" (love / okay / not great / bad). Negative ratings trigger a follow-up: "What can we do better?"
5. **Close** — "See you tomorrow ✌️"

### Daily Cap

Default: 5 articles per day (stored per-student in `students.daily_article_cap`).

When a student hits the cap, the serve-cached endpoint returns `goalReached: true` and no more articles are served. The cap adjusts over time based on the student's average daily reading volume.

---

## Article Lifecycle

### Freshness

- **Current events articles** have a freshness window of ~7 days. A Super Bowl article in March is stale.
- **Evergreen articles** (science explainers, animal profiles, history) have no expiration.
- **Planned:** `expires_at` column on `article_cache` to automate expiration for time-sensitive content.

### Cache Management

- The cache grows daily as new batches run
- Old articles are not deleted — they remain available for students who haven't seen them
- Articles flagged by guides (planned feature) are soft-deleted (`active = false`)
- Periodic cleanup: articles older than 90 days with `category = 'news'` can be archived

### Article States

```
[Generated] → [In Cache] → [Served to Student] → [Read] → [Discussed] → [Completed]
                                                     ↘ [Skipped via "Show me different"]
```

---

## Feedback Loops

### Data We Collect

| Signal | Source | What It Tells Us |
|---|---|---|
| Like/dislike on article | Reading page | Topic resonance |
| Favorite pick | Goal completion | Best content of the day |
| "Show me different" clicks | Student home | Topics NOT resonating |
| Interest suggestions | Goal completion chat | Explicit interest updates |
| Article ratings | Every 20th session | Overall content quality |
| Conversation quality scores | Comprehension reports | Article readability/discussability |
| Self-assessment | Post-conversation | Student engagement level |

### How Feedback Feeds Back (Planned)

1. **Favorites** → weight similar topics higher in future interest matching
2. **"Show me different" frequency** → if consistently high, review interest profile accuracy
3. **Interest suggestions** → append to student's `interest_profile` with a "suggested" flag
4. **Negative ratings + feedback** → review generation prompts, flag for manual review
5. **Low conversation scores on specific articles** → flag article as potentially problematic (unclear, too hard, too boring)

*Note: Feedback loops are currently data-collection only. The automated feedback integration is a planned enhancement.*

---

## Interest Evolution

### Current State

Student interests are captured during onboarding and stored in `interest_profile` as a JSON object with `primary_interests`, `secondary_interests`, and `notes`.

### Planned Enhancements

1. **Interest decay** — Interests not engaged with for 30+ days are downweighted
2. **Interest growth** — Topics the student consistently likes/favorites are promoted
3. **Explicit updates** — Interest suggestions from goal completion are incorporated
4. **Implicit signals** — Articles read to completion vs. skipped inform interest weights
5. **Interest refresh prompt** — Every 60 days, a brief "Are you still into [X]?" check

---

## Metrics & Monitoring

### Key Metrics

| Metric | What It Measures | Target |
|---|---|---|
| Daily completion rate | % of students who reach daily goal | > 60% on active days |
| "Show me different" rate | Avg clicks per session before picking | < 1.5 |
| Article completion rate | % of opened articles that are fully discussed | > 80% |
| Average conversation score | Comprehension quality | 65-75 (calibrated to level) |
| Content rating distribution | Article quality perception | > 70% "love" or "okay" |
| Domain diversity score | Topic variety per student per week | All students see 3+ domains |
| Buffer exhaustion rate | % of students who run out of articles | < 5% |

### Monitoring (Planned)

- Daily batch job success/failure alerts
- Weekly content diversity report
- Monthly rating trend analysis
- Automatic alerts when "show me different" rate exceeds threshold

---

## Cost Projections

Current per-job models, measured costs and the monthly estimate are in [ai-models.md](./ai-models.md). Article writing is shared across students, so its cost grows with the number of distinct interests (capped per day), not with the number of students; conversations and reports grow with reading and remain the main cost.

---

## Cron Schedule

| Job | Schedule | Purpose |
|---|---|---|
| Morning article batch | 5:00 AM CT daily (Vercel Cron, retried until complete) | Generate and distribute daily articles |
| Cache cleanup | 3:00 AM CT weekly (planned) | Archive expired news articles |
| Interest refresh | Monthly (planned) | Prompt students to update interests |
| Content diversity report | Weekly (planned) | Alert on topic imbalances |

---

## New Student Handling

When a student completes onboarding after the morning batch has run:

1. **Immediate:** Serve a current news article from the existing cache (instant, no generation delay)
2. **Background:** Generate 2-3 interest-matched articles based on their fresh interest profile
3. **Next morning:** The batch job includes them in the regular pipeline

This ensures no student's first experience is "come back tomorrow."

---

## Dependencies

- **Anthropic API** — models per job in `src/lib/models.ts` ([ai-models.md](./ai-models.md))
- **Anthropic web search tool** — Finds news and explainer pages on the sites in `src/lib/batch/sources.ts` (uses `ANTHROPIC_API_KEY`)
- **Neon Postgres** — Article cache and student data
- **Vercel Cron** — Batch job scheduling (see "How the batch is scheduled" below)

---

## Related Documents

- [Content Selection Policy](./content-policy.md) — Governing policy for all content decisions
- [Product Requirements](./product-requirements.md) — Overall product specification

---

## How the batch is scheduled

Vercel Cron calls `GET /api/cron/morning-batch` at :20 and :40 past 10:00 and 11:00 UTC, and again at 12:00 and 13:00 UTC (`vercel.json`). Cron schedules are UTC, so each call checks the America/Chicago clock and only starts work from 5 AM CT. The first real run therefore lands at 5:20 AM CT all year, through daylight saving changes. The :20 start also keeps it clear of the old 5:00 AM OpenClaw run while both are active.

- **Resumable.** Each call gets 800 s (`maxDuration`) and stops starting new work after about 740 s. Every finished base article, adaptation and served student is saved as it completes, and the next call picks up what's missing.
- **Locked.** The `batch_runs` table has one row per Chicago date with a 15-minute lease, so a duplicate cron delivery does nothing. Once a day's row is `complete`, later calls exit straight away.
- **Alerting.** If the day's run isn't complete by 7 AM CT, one email goes to `ADMIN_ALERT_EMAIL` through Resend.
- **Manual run.** `curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/morning-batch?force=1"` skips the clock check.
