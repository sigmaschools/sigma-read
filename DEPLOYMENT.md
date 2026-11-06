# SigmaRead — Deployment

## Live URL
**https://sigma-reader.vercel.app**

## Test Accounts

Passwords are never written in this repository (see "Secrets" in CLAUDE.md). Get them from the team's password manager or ask the admin.

| Role | Username/Email | Notes |
|------|---------------|-------|
| Guide | calie@sigmaschool.us | Primary test guide, has 8+ students |
| Guide | carolyn@sigmaschool.us | Parent test account, 3 students |
| Student | emma | L3 reader, active test data |
| Student | sofia | L2 reader |
| Student | marcus | L1 reader |
| Student | jayden | L2 reader |
| Student | aisha | L2 reader |
| Student | liam | L1 reader |
| Student | zara | L3 reader |
| Student | diego | L2 reader |
| Student | teststudent | Generic test account |

Real learners' accounts are not listed here.

## Stack
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes (serverless on Vercel)
- **Database:** Neon Postgres — project `sigma-reader`, org `org-gentle-bread-62220621`
- **AI:** Anthropic Claude, one model per job in `src/lib/models.ts`: Sonnet 5.5 (tutor conversation, report, standard jobs), Opus 5.5 (article writing), Haiku 5.5 (light helpers). See `docs/ai-models.md`
- **Hosting:** Vercel — team `sigmascore` (Pro plan, 60s function timeouts)

## Environment Variables (Vercel)
- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key
- `JWT_SECRET` — JWT signing secret
- `COMPASS_URL`, `COMPASS_INTERESTS_KEY` — optional: Compass server and the app key for its interests API (scopes read, write, controls, import). Server-side only; without them the app uses its own interest graph

## Repo
https://github.com/sigmaschools/sigma-read (main branch; the Vercel project is still named `sigma-reader`)

Git commits use `wvaughan@gmail.com` (required by Vercel team).

## Key API Routes
| Route | Purpose |
|-------|---------|
| `/api/auth/login` | Login (guide or student) |
| `/api/articles` | List student's articles |
| `/api/articles/serve-cached` | Serve pre-cached articles to student |
| `/api/articles/[id]` | Get/update article (PATCH for liked, read) |
| `/api/articles/[id]/define` | Word definition lookup |
| `/api/conversations` | Create new conversation |
| `/api/conversations/[id]/chat` | Conversation turns |
| `/api/conversations/[id]/self-assess` | Student self-assessment |
| `/api/guide/dashboard` | Batch dashboard data (single query) |
| `/api/guide/weekly-summary` | Weekly summary for guides |
| `/api/students` | List/create students |
| `/api/reports` | Comprehension reports |

## Reset Pattern
To fully reset a student (e.g., Wayne's account):
```sql
-- Delete in order (FK constraints)
DELETE FROM comprehension_reports WHERE conversation_id IN (SELECT c.id FROM conversations c JOIN reading_sessions rs ON c.reading_session_id = rs.id WHERE rs.student_id = ?);
DELETE FROM conversations WHERE reading_session_id IN (SELECT id FROM reading_sessions WHERE student_id = ?);
DELETE FROM reading_sessions WHERE student_id = ?;
DELETE FROM articles WHERE student_id = ?;
UPDATE students SET onboarding_complete = false, reading_level = NULL, interest_profile = NULL WHERE id = ?;
```
