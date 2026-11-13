# Article Selection & Serving

*Last updated: February 8, 2026*

This document explains how articles get from generation to a student's screen. For the generation pipeline itself, see [Article Pipeline](./article-pipeline.md). For content principles, see [Content Policy](./content-policy.md).

---

## How Articles Reach Students

```
Article Cache (shared pool, all levels)
       │
       ▼
Student Buffer (12 unread articles per student)
       │
       ▼
Student Feed (3 articles shown at a time)
       │
       ▼
"Show me different articles" → swaps 3 from buffer
```

### The Cache

A shared pool of articles at all reading levels. Populated daily by the morning batch job (5 AM CT). Each base article is generated at Level 4, then adapted by AI to all levels students need.

**Current cache:** 12 base articles × 4 level adaptations = 48 articles.

**Expiration:**
- News articles are flagged after **7 days** (stale news shouldn't be served)
- Non-news articles are flagged after **30 days**
- Flagged articles are never deleted — they're excluded from future serving but existing student data is preserved

### The Buffer

The morning batch fills each student's buffer to **10 unread articles** (`BUFFER_TARGET` in `src/lib/batch/morning-batch.ts`). When a student opens the home screen with fewer than 5 unread, the page asks the serve-cached route for 3 more from the cache.

**Buffer rules:**
- Stories the morning batch wrote for the student's own interests go to that student even when the buffer is full: up to 3 per batch run are guaranteed, and any beyond that compete in the ranking like other articles. Stories from the last 7 days that the student hasn't received yet count too, oldest first, so a story kept out by a full buffer or a failed serve step still reaches them. Normally that means the same morning; after a failed run, a backlog of older stories is served first and that morning's stories follow within a day or two. They count toward the buffer target; the rest of the target is filled by the interest ranking. Without this, a student with a queue of older unread articles would not see the story written for them until the queue drained.
- Never serve the same article twice to the same student (tracked in `student_article_history`)
- Exclude flagged articles
- Exclude expired news articles (>7 days old)
- Respect the student's reading level (with adjustments for level progression probing)

### The Feed

Students see up to **5 unread articles** on their home screen, in this order (`src/lib/feed-order.ts`): the tutorial article, then the rest by the day they were served, newest day first, oldest first within a day (so the morning's stories for the student's own interests, served first, lead the day). Newest day first means a story written for the student this morning isn't buried behind last week's queue, and yesterday's unread story still comes before older ones; oldest first within a day means a same-day top-up never hides the starter articles picked at onboarding. Days are the calendar days of the student's device.

An unread article stays in the buffer, and on the home screen, until the student reads it.

---

## Article Selection Principles

Every article must pass the **"why did we pick this?" test**. The answer is either:
1. "It matches the student's interests" (Interest — ~60% of articles)
2. "It's a factually significant event that teaches critical reading" (News — ~25%)
3. "It broadens the student's world" (Explore — ~15%)

### Content Mix

| Category | % of Feed | Selection Logic |
|----------|-----------|----------------|
| **Interest** | ~60% | Matched to student's interest profile (from onboarding + favorites + suggestions) |
| **News** | ~25% | Current events, kid-friendly, factually significant |
| **Explore** | ~15% | Topics outside the student's stated interests, designed to expand their world |

Category labels appear on article cards: News (blue), For You (violet), Explore (green).

### Domain Balance

The morning batch tracks which topic domains each student has read recently and actively balances their feed. A student who has read 4 science articles and 0 history articles will see history prioritized. This prevents topical echo chambers regardless of interest profiles.

---

## Never Re-Serve the Same Article

A student will **never** see the same article twice. This is tracked in the `student_article_history` table. If a student has read all available articles at their level, the system generates new ones rather than recycling.

---

## Daily Cap

Each student has a daily article cap (default: **5 articles per day**). After completing 5 articles in a day, the serve-cached route returns `goalReached: true` instead of more articles.

The daily cap is adjustable per student (`students.daily_article_cap`).

The home screen stops offering articles at the daily goal (**3**), not the cap: once a student has finished 3 today, it shows the day's summary and its questions (favourite article, "still into these?", the occasional rating) and then "See you tomorrow", which carries `id="finished"`. That is Sigma Read's end screen for Compass (app contract 2.1): the registry's `doneWhen` selector `#finished` lets Compass close Sigma Read and move on by itself. The owner's call (13 Nov 2026): after the day's reading, a book or something else beats more articles.

A "day" is the student's own local day: the student page sends the device's time zone (`?tz=` on `/api/student/daily-progress` and `/api/articles/serve-cached`) and `startOfLocalDay` in `src/lib/local-day.ts` starts the count at local midnight, so evening reading counts toward the day it was done. An unknown or missing zone falls back to midnight UTC. A finished reading counts once, even when its discussion has more than one completed conversation row.

---

## Level Progression Integration

When the level progression system is probing a student for a potential level change, the serve-cached route adjusts the mix:

- **Probing up:** Some articles served at base+1 level
- **Probing down:** Some articles served at base-1 level (confidence boost)

The student never knows which articles are probes. Category labels stay the same. Only the reading level of the article changes. See [Level Progression](./level-progression.md) for the full system.

---

## Feedback Loops

Student behavior feeds back into future article selection:

| Signal | What It Tells Us | How It's Used |
|--------|------------------|---------------|
| **Favorites** (goal completion pick) | "I loved this article" | Morning batch prioritizes similar topics |
| **Interest suggestions** | "I want articles about X" | Morning batch adds X to topic planning |
| **Article ratings** (periodic) | "Articles are good/bad overall" | Morning batch adjusts quality/variety |
| **"Show me different" clicks** | "These 3 don't interest me" | Tracked for pattern analysis |
| **Like/dislike** on articles | Quick content resonance signal | Fed into conversation prompt |

---

## Goal Completion Experience

When a student completes their daily goal (3 articles by default):

1. **Summary card** — "You read 3 articles today" with titles listed
2. **Favorite pick** — "Which was your favorite?" (tap to select)
3. **Interest prompt** (optional) — "Want to read about something new? Tell me" → quick AI chat
4. **Periodic rating** (every 20th session) — "How are the articles lately?" → simple rating
5. **Done** — "See you tomorrow ✌️"

This is appreciation, not gamification. No points, no streaks, no badges.
