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
| [`docs/product-requirements.md`](docs/product-requirements.md) | Current PRD — features, reading levels, data model, stack, success metrics |
| [`docs/product-boundary.md`](docs/product-boundary.md) | "SigmaRead Is / Is Not" — product identity, core values, quality bar |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Live URLs, test credentials, environment variables, API routes |
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
