# Interest graph

What each student is into, as scores over a shared topic map. Phase 1 of the design in the
"Student interest graph" doc: the data and the signals. Serving by affinity and the
"Still into these?" check-in come next.

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
| `checkin_keep` / `checkin_less` / `checkin_reject` | +0.3 / −half / reject | "Still into these?" answers (UI comes next) |
| `show_different`, `chat_mention`, `restored` | −0.1, +0.2, 0 | Defined for later phases |

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

## Upkeep

The morning batch tags each new base article (the interest it searched for, then the rewrite's
topic label), tags older untagged articles by exact match, and backfills signals from data
recorded before the graph: profile interests (dated at signup), likes and dislikes, favorites.
All of it is idempotent.
