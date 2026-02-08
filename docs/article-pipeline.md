# SigmaRead Article Pipeline — Technical Specification

*Last updated: February 8, 2026*

This document specifies the technical implementation of article generation, selection, and delivery. It implements the principles defined in [Content Selection Policy](./content-policy.md). The policy document is authoritative; this document describes how.

---

## Architecture Overview

```
[Morning Batch Cron - 5 AM CT]
        │
        ▼
[News Headlines] ──→ [Topic Planning] ──→ [Base Article Generation (Opus)]
        │                                           │
        ▼                                           ▼
[Student Interests]              [Level Adaptation (Sonnet)] ──→ [Article Cache]
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
**Script:** `scripts/morning-batch.ts`
**Runtime:** ~5-10 minutes for 50 students

### Step 1: News Sourcing

Pull current headlines from kid-friendly news sources:
- NewsForKids.net, DOGOnews, TimeForKids (web scraping)
- Brave Search API (supplementary queries for science, sports, animals, space)
- Claude curates the best 8-10 topics from the raw headlines

The curation prompt enforces the Three Bucket framework (see Content Policy):
- 7-8 Bucket 1 (universally safe)
- 1-2 Bucket 2 (civic literacy, only if genuinely significant)
- 0 Bucket 3 (polarizing — excluded)

### Step 2: Topic Planning

Before generating articles, the batch analyzes:
- **Active students** and their reading levels
- **Interest profiles** — what topics each student cares about
- **Recent reading history** — which domains are underrepresented this week
- **Buffer status** — which students need new articles

Output: a generation plan specifying how many articles to create and at which levels.

*Note: Step 2 is partially implemented. Currently the batch generates based on headlines without per-student interest matching. Full topic planning is a planned enhancement.*

### Step 3: Base Article Generation

- **Model:** Claude Opus 4.6 (best available for quality)
- **Level:** Generated at L4 (Grade 7) as the base
- **Count:** 6-10 base articles per day
- **Prompt:** Includes editorial neutrality rules, vocabulary constraints, word count targets

### Step 4: Level Adaptation

Each base article is adapted to all reading levels needed by active students.

- **Model:** Claude Sonnet 4.5 (mechanical rewrite task — cost efficient)
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

### Step 5: Buffer Fill

For each active student:
1. Check current unread count
2. If below 12 (buffer target), serve new articles from cache
3. Select articles the student has never seen (tracked via `student_article_history`)
4. Respect daily mix ratios (see Article Mix below)

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

### Per-Day Costs (50 students)

| Component | Model | Calls/Day | Cost/Day |
|---|---|---|---|
| News curation | Opus | 1 | ~$0.05 |
| Base article generation | Opus | 8-10 | ~$0.50 |
| Level adaptations | Sonnet | 30-40 | ~$0.50 |
| **Total generation** | | | **~$1.05/day** |

### Monthly (30 days)

- **Generation:** ~$31.50/month ($0.63/student/month)
- **Conversations:** ~$0.10-0.15/conversation × 3-5/student/day × 35 active students = ~$15-26/day = ~$450-780/month
- **Total estimated:** ~$500-800/month for 50 students

*Conversations are the primary cost driver, not article generation.*

---

## Cron Schedule

| Job | Schedule | Purpose |
|---|---|---|
| Morning article batch | 5:00 AM CT daily | Generate and distribute daily articles |
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

- **Anthropic API** — Claude Opus 4.6 (generation), Claude Sonnet 4.5 (adaptation)
- **Brave Search API** — Supplementary headline sourcing
- **Neon Postgres** — Article cache and student data
- **Vercel Cron / OpenClaw Cron** — Batch job scheduling

---

## Related Documents

- [Content Selection Policy](./content-policy.md) — Governing policy for all content decisions
- [Product Requirements](./product-requirements.md) — Overall product specification
