# Running inside Compass

Compass is the school shell a learner opens on a Mac or iPad. It runs SigmaRead in an app view, signs the student in, records the session, grades it and awards XP. SigmaRead does not compute XP. What each side promises is the Compass app contract, `compass/APP-CONTRACT.md` in `sigmaschools/compass-lab` (0.5.1 as of 6 Nov 2026). Changes Compass needs arrive here as issues labelled `compass` that cite the contract section; the pull request links the issue.

SigmaRead meets Compass in four places.

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

## 4. Signing in

Compass is the way in. It opens a first-party app with the student's profile note after the `#` of the launch address (`#compass_profile=<note>`, contract section 1.1): a JWT signed with Ed25519 by the Compass server. The student pages are wrapped in `CompassGate` (`src/components/CompassGate.tsx`), which takes the note out of the address and posts it to `POST /api/auth/compass` before the page loads anything. The server checks the note against the keys Compass publishes at `<COMPASS_URL>/.well-known/jwks.json` (cached for an hour; a note naming a key it does not hold fetches them again, at most once a minute and with a 4-second limit; the gate waits at most 8 seconds before showing the page as it was), with `aud` `sigma-read`, `iss` equal to `COMPASS_URL` (or `COMPASS_ISSUER` when set) and `exp` not passed (`src/lib/compass-profile.ts`, tests beside it). It then signs in the student whose `external_id` is the note's `sub`, with the same 7-day session cookie a password sign-in gave.

- A note for a Compass learner no SigmaRead student is linked to shows "Sigma Read isn't ready for you yet" instead of a sign-in form.
- A note that fails the checks, or a note for an unlinked learner, signs out whoever was signed in on the device before (a shared iPad never shows one student another's reading). A server without `COMPASS_URL`, or Compass's key page being down with no keys held, leaves the page as it was, so the saved password Compass fills on `/login` keeps working until that path is retired.
- The note is not stored and never reaches the server's access log: it travels after `#`, and only the gate's POST body carries it.

## The reading day

Compass shows the day's reading against a daily target, so SigmaRead's "today" must be the student's day: it starts at the student's local midnight, from the device's time zone ([article-selection.md](./article-selection.md#daily-cap)).

## What we learned

- **Node verifies Compass's notes without a library.** `jsonwebtoken` has no EdDSA; Node's `crypto` takes the published JSON Web Key as it is (`createPublicKey({ format: "jwk" })`) and checks the Ed25519 signature, so the sign-in adds no dependency.
- **The gate has to hold the page back.** React runs a child's effects before its parent's, so a gate that rendered the page while it signed in would let the page ask `/api/auth/me` first and bounce to `/login`. The gate shows a spinner until the sign-in answers.
- **A UTC day disagrees with Compass.** Before #121 the server counted "today" from midnight UTC, so a student's evening reading counted toward the next day's goal and cap, and the app could say the day was done before the student had read anything that day. The fix sends the device's zone with each request.
- **Interest data leaves only through the audited API.** Compass asked for the history to be imported by SigmaRead through its own key (#126) rather than copied out of the database, so children's data never passes through anyone's tools. Students had to be linked by `external_id` first (migration 0014).
- **One replace key per topic.** An article carries several topics, and a replace key that spanned the whole log let one topic's newest rating hide another's. SigmaRead's client (#127) raised it, and Compass now applies a replace key per topic (contract 0.5.1).
