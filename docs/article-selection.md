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

Each student has a buffer of **12 unread articles**. When the buffer runs low (fewer than 12), the serve-cached route refills it from the cache.

**Buffer rules:**
- Never serve the same article twice to the same student (tracked in `student_article_history`)
- Exclude flagged articles
- Exclude expired news articles (>7 days old)
- Respect the student's reading level (with adjustments for level progression probing)

### The Feed

Students see **exactly 3 articles** at a time on their home screen. These are the 3 most recent unread articles from their buffer.

**"Show me different articles"** replaces all 3 with the next 3 from the buffer. It does not append — it swaps. The student always sees exactly 3.

If the buffer is exhausted, the student sees a message that new articles will be available tomorrow.

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
