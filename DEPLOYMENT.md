# SigmaRead — Deployment

## Live URL
**https://sigma-reader.vercel.app**

## Test Credentials

| Role | Username/Email | Password | Notes |
|------|---------------|----------|-------|
| Guide | calie@sigmaschool.us | sigma2026 | Calie Garrett — primary test guide, has 8+ students |
| Guide | carolyn@sigmaschool.us | sigma2026 | Carolyn Vaughan — parent test account, 3 students |
| Student | emma | emma2026 | L3 reader, active test data |
| Student | sofia | sofia2026 | L2 reader |
| Student | marcus | marcus2026 | L1 reader |
| Student | jayden | jayden2026 | L2 reader |
| Student | aisha | aisha2026 | L2 reader |
| Student | liam | liam2026 | L1 reader |
| Student | zara | zara2026 | L3 reader |
| Student | diego | diego2026 | L2 reader |
| Student | max | max2026 | Max Vaughan — needs onboarding |
| Student | wayne | wayne2026 | Wayne's test account |
| Student | teststudent | test2026 | Generic test account |

## Stack
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes (serverless on Vercel)
- **Database:** Neon Postgres — project `sigma-reader`, org `org-gentle-bread-62220621`
- **AI:** Anthropic Claude Sonnet 4.5 (conversations, reports, articles), Haiku 4.5 (planning, definitions, pre-reading)
- **Hosting:** Vercel — team `sigmascore` (Pro plan, 60s function timeouts)

## Environment Variables (Vercel)
- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key
- `JWT_SECRET` — JWT signing secret

## Repo
https://github.com/sigmaschools/sigma-reader (main branch)

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
