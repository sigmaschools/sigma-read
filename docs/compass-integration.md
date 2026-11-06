# Running inside Compass

Compass is the school shell a learner opens on a Mac or iPad. It runs SigmaRead in an app view, signs the student in, records the session, grades it and awards XP. SigmaRead does not compute XP. What each side promises is the Compass app contract, `compass/APP-CONTRACT.md` in `sigmaschools/compass-lab` (0.5.1 as of 6 Nov 2026). Changes Compass needs arrive here as issues labelled `compass` that cite the contract section; the pull request links the issue.

SigmaRead meets Compass in three places.

## 1. Reports in the page

Compass's page agent reads `<script type="application/json" data-compass-report>` blocks (`src/components/CompassReport.tsx`; the field names are fixed by the contract, so don't rename them). No student name, email or other personal detail goes into a report.

| Report | Where | Fields | Built by |
|---|---|---|---|
| `comprehension` | The conversation page, once the discussion is complete (and again after the self-rating) | `article`, `words`, `overall`, `skills`, `selfRating`, `finishedAt`, `articleLexile`, `levelBefore`, `levelAfter`, `appVersion` | `buildComprehensionReport` in `src/lib/compass-report.ts`, data from `src/lib/compass-report-data.ts` |
| `level` | Every signed-in student screen (`src/app/student/layout.tsx`), refreshed on navigation and after a level may have changed | `value` (Lexile), `setAt`, `history`, `appVersion` | `buildLevelReport`, served by `/api/student/compass-level` |

Levels are reported in Lexile as the middle of each level's band (L1 450 to L6 1200, `levelToLexile`). `appVersion` is the deploy's short commit. Building a report never fails a student's request (`safeComprehensionCompassReport`). Tests: `src/lib/compass-report.test.ts`.

## 2. SigmaRead's read-only API

Compass, or a guide's tools, can read students, sessions and reports from SigmaRead with a key: [compass-api.md](./compass-api.md). A student's `external_id` holds their Compass learner id (`GET /api/v1/students/by-external/{id}`).

## 3. The interest graph

Since 6 Nov 2026 a linked student's interests live in Compass, reached with SigmaRead's own Compass key (`COMPASS_URL`, `COMPASS_INTERESTS_KEY`, server-side only). Recording, reading, the first import and the nightly sync: [interest-graph.md](./interest-graph.md#compass). Students without an `external_id`, or a server without the key, use the local graph as before.

## The reading day

Compass shows the day's reading against a daily target, so SigmaRead's "today" must be the student's day: it starts at the student's local midnight, from the device's time zone ([article-selection.md](./article-selection.md#daily-cap)).

## What we learned

- **A UTC day disagrees with Compass.** Before #121 the server counted "today" from midnight UTC, so a student's evening reading counted toward the next day's goal and cap, and the app could say the day was done before the student had read anything that day. The fix sends the device's zone with each request.
- **Interest data leaves only through the audited API.** Compass asked for the history to be imported by SigmaRead through its own key (#126) rather than copied out of the database, so children's data never passes through anyone's tools. Students had to be linked by `external_id` first (migration 0014).
- **One replace key per topic.** An article carries several topics, and a replace key that spanned the whole log let one topic's newest rating hide another's. SigmaRead's client (#127) raised it, and Compass now applies a replace key per topic (contract 0.5.1).
