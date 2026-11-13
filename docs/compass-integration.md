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

## 2. No API of SigmaRead's own

SigmaRead had a key-protected read API under `/api/v1` (students, sessions, reports) and an API Keys admin page. Nothing called it, so both were removed on 13 Nov 2026 (issue 164). Compass learns what a student did from the report on the page (section 1) and from the session it recorded. A student's `external_id` holds their Compass learner id. The `api_clients` and `api_request_log` tables are still in the database, unused, until the owner agrees to drop them.

## 3. The interest graph

Since 6 Nov 2026 a linked student's interests live in Compass, reached with SigmaRead's own Compass key (`COMPASS_URL`, `COMPASS_INTERESTS_KEY`, server-side only). Recording, reading, the first import and the nightly sync: [interest-graph.md](./interest-graph.md#compass). Students without an `external_id`, or a server without the key, use the local graph as before.

## 4. Signing in

Compass is the way in. It opens a first-party app with the student's profile note after the `#` of the launch address (`#compass_profile=<note>`, contract section 1.1): a JWT signed with Ed25519 by the Compass server. The student pages are wrapped in `CompassGate` (`src/components/CompassGate.tsx`), which takes the note out of the address and posts it to `POST /api/auth/compass` before the page loads anything. The server checks the note against the keys Compass publishes at `<COMPASS_URL>/.well-known/jwks.json` (cached for an hour; a note naming a key it does not hold fetches them again, at most once a minute and with a 4-second limit; the gate waits at most 8 seconds before showing the page as it was), with `aud` `sigma-read`, `iss` equal to `COMPASS_URL` (or `COMPASS_ISSUER` when set) and `exp` not passed (`src/lib/compass-profile.ts`, tests beside it). It then signs in the student whose `external_id` is the note's `sub`, with the same 7-day session cookie a password sign-in gave.

- Compass owns the people (issue 164, 13 Nov 2026). A note for a Compass learner SigmaRead has not met makes their student row on the spot, from the note: the learner id (`external_id`), the name and the grade. Nobody adds or links a student by hand. At every later sign-in the name and grade are brought up to date from the note; a note without one leaves that field alone. They are kept on the row because the tutor, the reports and the morning batch need them when no note is at hand. The new student then onboards as below. ("Sigma Read isn't ready for you yet" shows only if the row could not be made.)
- A note that does not sign anyone in (refused, for an unlinked learner, Compass's keys unreachable, or no answer within 8 seconds) signs out whoever was signed in on the device before, so a shared iPad never shows one student another's reading. The page then says "Open Sigma Read from Compass" (`/open-from-compass`). There is no password sign-in any more (13 Nov 2026): `/login` redirects to that page, no account has a password, and "Sign out" on the admin pages leads back to Compass Admin (`COMPASS_URL/admin/`). The `password_hash` columns still hold the old hashes, unread, until the owner agrees to drop them.
- There is no top bar on the student screens: Compass's own bar names the app and the student and has the X for leaving, so SigmaRead's bar (app name, the student's name and a menu with Welcome and Sign out) went with standalone use. The reading and discussion screens keep their Back link.
- The note is not stored and never reaches the server's access log: it travels after `#`, and only the gate's POST body carries it.

## 5. The admin pages

Compass Admin opens the admin pages from **Administration, Apps** (contract 1.10, section 1.2), once SigmaRead's registry entry has `adminUrl` (`https://sigma-reader.vercel.app/admin`). The address carries `#compass_adult=<note>`: a two-minute note signed with the same keys, `aud` `sigma-read/admin`, naming the adult. `src/app/admin/layout.tsx` wraps the pages in `CompassGate kind="admin"`, which posts it to `POST /api/auth/compass-admin` (`verifyAdultNote`). Compass decides who is an admin: a note with `staff: true` (contract 1.15: the adult is an admin of Compass's root organisation, the people who run it for every school) opens the pages, with a session that lasts a day. A school's own roles in the note never do. Until every admin is Compass staff, the older way works too: the `admins` row whose `external_id` is the note's `sub`, or the first time, the row with the note's email, which is then linked (`drizzle/0017_admin_compass_id.sql` adds the column). The session carries the adult's Compass id and name, and the audit log records them (`admin_compass_id`, `admin_name`, migration 0023), so nothing needs the `admins` row once it goes. Compass signs adults in only through a link sent to their address, so the note's email is one they own. If an admin's SigmaRead email is not their Compass email, link the row once by hand (`admins.external_id` = their Compass person id, in lower case). Anyone else sees "You are not a Sigma Read admin". The admin pages themselves are unchanged, except that a student's detail page (reports, insights, interests, flags) moved from the retired guide pages to `/admin/students/<id>`.

## 6. No guide or parent pages

Guides and parents follow a student's reading in Compass (the Guide app and Review), so SigmaRead's own guide pages (`/guide`), parent page (`/parent`, with its chat), the weekly parent email and its one-click sign-in link (`/api/auth/auto-login`) are gone, and the password sign-in no longer accepts a guide or parent. Guide and parent rows stay in the database: every student still belongs to a guide, and history keeps its links. Admins can still view as a student, not as a guide; the admin Parents page went with the parent pages.

## The reading day

The day's end screen is "See you tomorrow" on the home screen, `#finished`, shown only after the day's last article and its questions; no more articles are offered after it ([article-selection.md](./article-selection.md#daily-cap)). Compass's registry entry needs `doneWhen` `{"selector": "#finished"}` for Compass to close Sigma Read there.

How many articles make the day comes from Compass: the profile note's `student.goal.units` (app contract 1.11), stored at each Compass sign-in, three when the note has none.


Compass shows the day's reading against a daily target, so SigmaRead's "today" must be the student's day: it starts at the student's local midnight, from the device's time zone ([article-selection.md](./article-selection.md#daily-cap)).

## What we learned

- **Node verifies Compass's notes without a library.** `jsonwebtoken` has no EdDSA; Node's `crypto` takes the published JSON Web Key as it is (`createPublicKey({ format: "jwk" })`) and checks the Ed25519 signature, so the sign-in adds no dependency.
- **The gate has to hold the page back.** React runs a child's effects before its parent's, so a gate that rendered the page while it signed in would let the page ask `/api/auth/me` first and bounce to `/login`. The gate shows a spinner until the sign-in answers.
- **A UTC day disagrees with Compass.** Before #121 the server counted "today" from midnight UTC, so a student's evening reading counted toward the next day's goal and cap, and the app could say the day was done before the student had read anything that day. The fix sends the device's zone with each request.
- **Interest data leaves only through the audited API.** Compass asked for the history to be imported by SigmaRead through its own key (#126) rather than copied out of the database, so children's data never passes through anyone's tools. Students had to be linked by `external_id` first (migration 0014).
- **One replace key per topic.** An article carries several topics, and a replace key that spanned the whole log let one topic's newest rating hide another's. SigmaRead's client (#127) raised it, and Compass now applies a replace key per topic (contract 0.5.1).
