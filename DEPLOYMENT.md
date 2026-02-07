# SigmaRead - Deployment Notes

## Live URL
**https://sigma-reader.vercel.app**

## Test Credentials

| Role | Username/Email | Password |
|------|---------------|----------|
| Guide (teacher) | calie@sigmaschool.us | sigma2026 |
| Student | max | max2026 |

## Stack
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless on Vercel)
- **Database**: Neon Postgres (free tier, US East 1)
- **AI**: Anthropic Claude (via API)
- **Hosting**: Vercel (sigmascore team)

## Environment Variables (Vercel)
- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key
- `JWT_SECRET` — JWT signing secret

## Seeding
Test data was seeded via `POST /api/seed`. This creates:
- Guide: Calie Garrett (calie@sigmaschool.us)
- Student: Max (username: max), linked to Calie

## What Works (MVP)
- ✅ Login (guide + student)
- ✅ Student onboarding — conversational interest profiling + reading level assessment
- ✅ AI-generated articles tailored to student interests/level
- ✅ Article reader with click-to-define vocabulary
- ✅ Post-reading AI conversation (comprehension discussion)
- ✅ Comprehension reports (auto-generated scores + analysis)
- ✅ Student session history
- ✅ Guide dashboard — student list, reading levels, session counts
- ✅ Guide student detail — score trendline, session history with expandable reports + transcripts
- ✅ Guide add student

## Known Gaps
- No password hashing salt rotation
- No email-based auth/password reset
- No real-time updates (polling-based)
- Mobile responsive but not optimized
- No dark mode toggle (follows system)
- Conversation doesn't handle edge cases (very long chats, token limits)
- No rate limiting on AI endpoints

## Repo
https://github.com/sigmaschools/sigma-reader (main branch)
