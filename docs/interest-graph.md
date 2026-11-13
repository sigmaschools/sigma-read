# Interest graph

What each student is into, as scores over a shared topic map, used to choose their articles.
Phase 1 of the design in the "Student interest graph" doc, plus chat-mention extraction and
horizon topics from the map. Learned topic links come later.

Compass holds the only record of a learner's interests and the only topic map. SigmaRead keeps
no copy: it sends what a student does to Compass and asks Compass for scores, rankings and the
map. The one thing it stores is which topics each of its own articles is about (`article_topics`).

All code goes through `src/lib/interest-graph` (`recordSignals`, `getAffinities`, `getRelated`,
`resolveTopics` and helpers).

## Compass

Compass keeps one record of each learner's interests for every Compass app (compass-lab
`compass/APP-CONTRACT.md` section 6, "Interests", section version 1.0; issue #126). SigmaRead
uses it for a student when `COMPASS_URL` and `COMPASS_INTERESTS_KEY` are set (server-side only)
and the student's `external_id` holds their Compass learner id. The client is
`src/lib/interest-graph/compass.ts`.

| SigmaRead | Compass |
|---|---|
| `recordSignals`, check-in answers | `POST /interests/evidence`, same type names and source refs (likes and dislikes get `replaceKey` `rating:<article>:<topic>`) |
| an adult's remove or restore | `POST /learners/{id}/controls` (`remove`/`restore`, guide, guardian or admin, with the user id) |
| `getAffinities` | `GET /learners/{id}` (removed and rejected both mean "never serve") |
| feed serving (`feedScoring`) | `POST /learners/{id}/rank`; excluded items are never served. SigmaRead keeps its own every-third-slot exploration and topic variety on top |
| horizon topics | `GET /learners/{id}/explore` |
| the tutor's interest line | `GET /learners/{id}/context`, put in the prompt as given (contract 6.6), cached 3 minutes |
| the adults' panel | `GET /learners/{id}` |
| morning batch | `POST /interests/learners`, one call for every linked student |
| the topic map | `GET /interests/topics`, re-read every 5 minutes with its ETag (`fetchTopicMap`) |
| the "still into these?" history | `GET /learners/{id}/evidence`: SigmaRead's own events for the learner, without their words (contract 1.16) |
| morning upkeep | `resendReadingState` (`POST /interests/import`): profile interests, thumbs and favorites that Compass's list of SigmaRead's events lacks |

Reads time out after 2 seconds (the evidence list after 5). When Compass is off, a
call fails or times out, or a student is not linked, SigmaRead does what an app without
interests does (contract 6.7):

- the feed is the unranked random mix, and the batch plans a student's articles from the
  profile list on their row;
- the tutor gets no interest line, no horizon topic comes from the map, the check-in is not
  asked, and the adults' panel shows the plain profile list;
- articles are still tagged, against the last map read or the one bundled in `taxonomy.ts`;
- a declared interest, thumb or favorite that didn't reach Compass is sent again by the next
  morning batch. A smaller signal (a pick, a pass-over, a chat mention, a check-in answer) is lost.

A student's `external_id` is set when Compass first opens SigmaRead for them. A student's words
are never logged when calling Compass (6.5).

Topic slugs are Compass topic ids. Compass's map holds SigmaRead's topics plus specific "things"
(kind `thing`); phrases and articles are matched only to the topics, though every label is known.

## Data

| Table | Holds |
| --- | --- |
| `article_topics` | Topics of a base `article_cache` row. Level adaptations share their base's tags |

`topics`, `topic_aliases`, `topic_relations` and `interest_signals` are still in the database
and in `schema.ts`, unused, until the owner agrees to drop them.

`src/lib/interest-graph/taxonomy.ts` holds the alias phrases ("great whites" → `sharks`) and a
bundled copy of the topic tree, used only when Compass's map can't be read. A new topic is added
in Compass; add its aliases here.

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
| `chat_mention` | +0.2 | After an article discussion, for each interest the student brought up themselves (see below) |
| `show_different` | −0.1 | Defined for a later phase |

`source_ref` makes recording idempotent: Compass stores the same (learner, type, ref) once. Every call
site wraps recording in `quietly()`, so a graph failure never breaks the student's page.

Weights are Compass's; the table shows what it applies. Free text resolves by exact match on slug, label or alias (case, plurals, punctuation and filler
like "facts about" are ignored, and short phrases match on their last words unless the words in
front name a different topic that isn't an ancestor: "great white sharks" and "pet dogs" match, but
"computer science" doesn't land on science). What's left can go
to Haiku in one call per request (onboarding, typed interests, batch tagging), constrained to the
topic list or "none". Personal facts and unsafe text map to none. A model match is remembered in memory only (a day at most), so each batch asks once for a profile phrase that only the model can place.

### Chat mentions

When a discussion ends, `recordChatMentions` (called from `saveComprehensionReport`, so the
simulator records them too) sends the article and the conversation to Haiku once and asks for outside subjects the
student showed a personal interest in: things they like, do, play or want to read about. Answers
that only restate the article, the article's own subject, personal or family facts and unsafe text
are left out, and "none" is the usual answer. Each mention must quote the student's own words
(checked against their messages as whole words, two words or more), dislikes, complaints and things the student only has to do are left out (hard or scary things they like still count), nothing is recorded for an article with no topics, and student text is escaped inside the prompt. The subjects go through
`resolveTopics`; subjects over three words are dropped, and only topics outside the article's own (and their parents) are recorded, at most 3 per conversation, with
`source_ref` `chat:<conversation>:<topic>`. Tutorials record nothing. Usage shows as "Chat
interests" in the admin metrics. Logs show topic slugs only, never the student's words.

## Affinity

Computed by Compass from its log on each read (SigmaRead only reads the result):

    score = clamp(Σ weight · 0.5^(age / half-life), −1, 1)

Half-life is 90 days for declared interests and 45 for everything else, with no floor. "No more"
or an adult's removal marks a topic rejected (score 0) until the student names it again (in
onboarding or a typed interest, which starts the topic over) or an adult restores it (which keeps
its history since the student's last fresh start, and doesn't make it a declared interest). So a
removed topic comes back if the student asks for it again. Articles on rejected topics are never
served, and the morning batch doesn't plan articles for them (see Generation).
`confidence` grows with the amount of recent evidence, not its direction.

## Generation

The morning batch plans interest articles per student from `batchInterestsFor`
(`src/lib/interest-graph/batch-interests.ts`): the profile list minus any phrase that resolves to
a rejected or negative topic, plus up to 3 graph topics scoring 0.25 or more that the profile
doesn't already name (an interest picked up in chat, a topic they keep choosing), strongest first,
by label. Profile phrases match exactly, and the ones that don't go to Haiku once. If Compass
can't be read, the batch plans from the profile (logged). The least-recently-featured rotation then picks up to 3 per student
as before.

The day's horizon article comes from `horizonTopicsFor`, which asks Compass for topics next to
the student's strongest interests that they have no view on yet (`GET /learners/{id}/explore`). Each
student's top 3 go into a shared pool with the model-suggested adjacent interests of students
who have no graph data yet, and one topic not featured in the last 14 days is picked at random (a topic several students
are near is more likely).
Serving's explore slots then show it to students for whom it is new.

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
- "Never served" for rejected topics holds whenever Compass can be read; it is best-effort
  during an outage, when serving falls back to unranked.

## "Still into these?"

On a goal day, after the favorite pick, the page shows this check-in instead of the "anything you
want to read about tomorrow?" question, so the student only ever sees one question. It is due
two weeks after the last check-in (or after the student's first signal), read from SigmaRead's
own events in Compass, and asks about up to
three topics, most pressing first: two dislikes in a row, passed over 3+ times in 30 days, a
declared interest with no positive signal for 30 days, then the most-served topics. Topics
answered in the last 30 days and rejected topics are skipped. Each topic gets "Still love it",
"Not as much" or "No more"; Skip saves what was answered and counts as asked. Only a due check-in is
saved, and only once its answers have reached Compass (otherwise it stays due and is asked again), for the topics it offered, so a double-click or replay changes nothing. Dislikes from
before a topic's last check-in answer don't bring it back.

## What adults see

The admin's student page shows an Interests panel (`src/components/InterestPanel.tsx`,
`GET/POST /api/students/{id}/interests`): current interests (score 0.15 or more, at most 8, "new"
when first seen in the last two weeks and not declared), declared interests that are fading, and
topics the student or an adult turned off, each with remove or restore (sent to Compass as a
control). When Compass can't answer, or has nothing for the student yet, the panel shows their
profile list with nothing to change.

## Upkeep

The morning batch tags each new base article (the interest it searched for, then the rewrite's
topic label), tags older untagged articles by exact match, and re-sends reading state Compass
lacks (`resendReadingState`): profile interests (dated at signup), likes and dislikes, favorites.
All of it is idempotent.
