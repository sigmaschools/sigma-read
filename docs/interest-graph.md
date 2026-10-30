# Interest graph

What each student is into, as scores over a shared topic map, used to choose their articles.
Phase 1 of the design in the "Student interest graph" doc. Horizon topics chosen per student,
learned topic links and chat-mention extraction come later.

All code goes through `src/lib/interest-graph` (`recordSignals`, `getAffinities`, `getRelated`,
`resolveTopics` and helpers), never the tables, so the graph can move to Compass later by
swapping that module's internals.

## Data

| Table | Holds |
| --- | --- |
| `topics` | The shared map, three levels (domain → category → topic), keyed by stable `slug` |
| `topic_aliases` | Extra phrases for a topic ("great whites" → `sharks`), stored normalized. `origin` is `seed`, `ai` or `admin` |
| `topic_relations` | Links across the tree. Parents, children and siblings are related through `parent_slug` already |
| `article_topics` | Topics of a base `article_cache` row. Level adaptations share their base's tags |
| `interest_signals` | Append-only log: student, topic (or just the phrase, if it matched nothing), type, weight, `source_app`, `source_ref`, time |

The seed map lives in `src/lib/interest-graph/taxonomy.ts`. `drizzle/0011_interest_graph.sql` is
generated from it (`npx tsx scripts/gen-topic-seed.ts`), and a test fails if the two drift. Once
0011 has shipped, add new topics with a new migration.

## Signals

| Signal | Weight | Recorded when |
| --- | --- | --- |
| `onboarding` | +0.6 | The interest interview finishes (one per interest) |
| `typed_interest` | +0.6 | The student answers "anything you want to read about tomorrow?" |
| `chose_article` / `passed_over` | +0.15 / −0.03 | A student opens an article: its topics, and those of the other unread articles in the feed |
| `liked` / `disliked` | ±0.3 | Thumbs after reading. Changing your mind replaces the earlier rating |
| `favorite` | +0.4 | The day's favorite pick |
| `strong_engagement` | +0.1 | A report scores 80+ over 4+ student messages, without a forced close |
| `checkin_keep` / `checkin_less` / `checkin_reject` | +0.3 / −half / reject | "Still into these?" answers |
| `removed` / `restored` | 0 | A guide, parent or admin takes a topic off, or puts it back (keeps its history) |
| `show_different`, `chat_mention` | −0.1, +0.2 | Defined for later phases |

`source_ref` makes recording idempotent: the same (student, type, ref) is stored once. Every call
site wraps recording in `quietly()`, so a graph failure never breaks the student's page.

Free text resolves by exact match on slug, label or alias (case, plurals, punctuation and filler
like "facts about" are ignored, and short phrases match on their last words). What's left can go
to Haiku in one call per request (onboarding, typed interests, batch tagging), constrained to the
topic list or "none". Personal facts and unsafe text map to none. Matches are saved as aliases.

## Affinity

Computed from the log on read, never stored:

    score = clamp(Σ weight · 0.5^(age / half-life), −1, 1)

Half-life is 90 days for declared interests and 45 for everything else, with no floor. "No more"
marks a topic rejected (score 0) until the student names it again or an adult restores it.
`confidence` grows with the amount of recent evidence, not its direction.

## Serving

Both serving paths (`/api/articles/serve-cached` when the feed runs low, and the batch's serving
step) pick from the unseen articles at the student's level with `pickForFeed`
(`src/lib/interest-graph/serving.ts`):

- An article's match is its best topic's score; untagged articles score 0.
- Any rejected topic rules the article out.
- Two of every three slots take the best match, preferring a topic not already served in this
  round, with a little randomness so near-equal articles take turns.
- Every third slot explores: a random article whose match is between −0.2 and 0.1, so the feed
  widens without serving something the student dislikes.
- A student with no signals gets the same random mix as before, and so does anyone whose
  affinities or article tags can't be read (logged), so the feed never comes up empty.
- Candidates per level are a random sample of 60 unseen articles plus up to 40 tagged with the
  student's top 10 topics, so their interests are in the pool however large the cache gets.
  Seen articles are excluded in SQL. The batch ranks the 50 newest unseen.
- "Never served" for rejected topics holds whenever the graph can be read; it is best-effort
  during a database failure, when serving falls back to unranked.

## "Still into these?"

On a goal day, after the favorite pick, the page shows this check-in instead of the "anything you
want to read about tomorrow?" question, so the student only ever sees one question. It is due
two weeks after the last check-in (or after the student's first signal), and asks about up to
three topics, most pressing first: two dislikes in a row, passed over 3+ times in 30 days, a
declared interest with no positive signal for 30 days, then the most-served topics. Topics
answered in the last 30 days and rejected topics are skipped. Each topic gets "Still love it",
"Not as much" or "No more"; Skip saves what was answered and counts as asked. Only a due check-in is
saved, for the topics it offered, so a double-click or replay changes nothing. Dislikes from
before a topic's last check-in answer don't bring it back.

## What adults see

The guide's student page and the parent's child view show an Interests panel
(`src/components/InterestPanel.tsx`, `GET/POST /api/students/{id}/interests`): current interests
(score 0.15 or more, at most 8, "new" when first seen in the last two weeks and not declared),
declared interests that are fading, and topics the student or an adult turned off, each with
remove or restore. Guides see their own students, parents their linked children, admins all.
Before a student has any signals the panel shows their profile list as before.

## Upkeep

The morning batch tags each new base article (the interest it searched for, then the rewrite's
topic label), tags older untagged articles by exact match, and backfills signals from data
recorded before the graph: profile interests (dated at signup), likes and dislikes, favorites.
All of it is idempotent.
