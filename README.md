# SigmaRead

A reading comprehension app where kids read nonfiction articles matched to their interests and level, then discuss them with an AI that assesses their understanding. No quizzes. No multiple choice.

**Live:** https://sigma-reader.vercel.app

## Quick Start

```bash
npm install
cp .env.example .env.local  # Add DATABASE_URL, ANTHROPIC_API_KEY, JWT_SECRET
npm run dev
```

## Documentation

| Document | What's In It |
|----------|-------------|
| **Product** | |
| [`docs/product-requirements.md`](docs/product-requirements.md) | Current PRD — features, reading levels, data model, stack, success metrics |
| [`docs/product-boundary.md`](docs/product-boundary.md) | "SigmaRead Is / Is Not" — product identity, core values, quality bar |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Live URLs, test credentials, environment variables, API routes |
| **How Things Work** | |
| [`docs/conversation-design.md`](docs/conversation-design.md) | AI conversation rules — 6 styles, tone, message length, scoring rubric |
| [`docs/level-progression.md`](docs/level-progression.md) | Gradual Mix level system — how students move between reading levels |
| [`docs/article-selection.md`](docs/article-selection.md) | How articles get from cache to student feed — buffer, daily cap, feedback loops |
| [`docs/article-pipeline.md`](docs/article-pipeline.md) | Morning batch generation — news sourcing, topic planning, Opus/Sonnet hybrid |
| [`docs/content-policy.md`](docs/content-policy.md) | What we publish and why — Three Bucket framework, selection principles |
| [`docs/content-safety.md`](docs/content-safety.md) | 3-layer content filtering — onboarding, regex, generation |
| [`docs/student-onboarding.md`](docs/student-onboarding.md) | Walkthrough + interest interview + initial article delivery |
| [`docs/session-analytics.md`](docs/session-analytics.md) | What we track per session and diagnostic SQL queries |
| [`docs/admin-interface.md`](docs/admin-interface.md) | Admin role — dashboard, students, guides, content, metrics, impersonation |
| **Testing** | |
| [`docs/testing/feedback-filter.md`](docs/testing/feedback-filter.md) | 5-gate evaluation filter for prioritizing improvements |
| [`docs/testing/guide-personas.md`](docs/testing/guide-personas.md) | 4 guide personas for simulated testing |
| [`docs/testing/test-scenarios.md`](docs/testing/test-scenarios.md) | 12 task-based test scenarios |
| [`docs/testing/parent-interview-guide.md`](docs/testing/parent-interview-guide.md) | Interview script for parent UX testing |
| **Research** | |
| [`docs/research/learning-science-review.md`](docs/research/learning-science-review.md) | Learning science analysis and recommendations |
| [`docs/research/founder-interview-2026-02-07.md`](docs/research/founder-interview-2026-02-07.md) | Full transcript of Wayne's UX feedback session |
| [`docs/research/founder-interview-guide.md`](docs/research/founder-interview-guide.md) | Interview structure used for the founder session |
| **Archive** | |
| [`docs/archive/original-prd-2026-02-06.md`](docs/archive/original-prd-2026-02-06.md) | Original PRD (historical reference — superseded by product-requirements.md) |

## Stack

Next.js 16 · TypeScript · Tailwind CSS · Neon Postgres · Anthropic Claude · Vercel
