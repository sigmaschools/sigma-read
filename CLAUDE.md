# SigmaRead — Claude Code Instructions

AI-powered reading comprehension for K-8 students. Kids read nonfiction articles matched to their interests and level, then discuss them with an AI tutor. No quizzes.

## Commands

```bash
npm run dev          # Local dev server
npm run build        # Production build (use to verify changes)
npm run lint         # ESLint (pre-existing warnings, non-blocking in CI)
npx drizzle-kit push # Push schema changes to DB
npx tsx scripts/<name>.ts  # Run utility scripts (requires DATABASE_URL)
```

No test framework — verify changes with `npm run build`.

## Environment Variables

- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key
- `JWT_SECRET` — JWT signing secret

## Architecture

```
src/
  app/
    api/           # Next.js API routes (all authenticated via getSession)
    student/       # Student pages (sticky top bar, max-w-2xl, "use client")
    guide/         # Guide pages (sidebar layout, max-w-5xl)
    admin/         # Admin pages
    login/         # Auth
  lib/
    auth.ts        # JWT session management (getSession, hashPassword, etc.)
    db/
      index.ts     # Drizzle ORM connection
      schema.ts    # All 16 tables — the authoritative data model
    prompts.ts     # All AI system prompts (~26KB) — handle with care
    level-progression.ts  # Gradual Mix level system — complex, well-documented
scripts/           # Utility scripts (cache, seed, simulate)
docs/              # Product docs, conversation design, testing guides
```

## Key Conventions

@PATTERNS.md

Additional rules:

- **AI models**: Opus 4.6 for student conversations, Sonnet 4.5 for article generation, Haiku 4.5 for planning/classification/definitions
- **Auth pattern**: Every API route checks `getSession()` first, returns 401 if missing
- **All API routes**: Must `export const dynamic = "force-dynamic"` when authenticated
- **Imports**: Use `@/` path alias (maps to `src/`)
- **CSS**: Use CSS variables (`--fg`, `--muted`, `--accent`, `--border`, `--surface`), not hardcoded colors
- **DB changes**: Edit `src/lib/db/schema.ts`, then `npx drizzle-kit push` for dev
- **Scripts**: Use `@neondatabase/serverless` directly (not Drizzle ORM)

## Git & Deployment

- Repo: `sigmaschools/sigma-read` on GitHub
- Default branch: `main` (protected — no direct pushes)
- Git author: `wvaughan@gmail.com`
- Deploy: Vercel (auto-deploys from main on merge)
- Commit style: short description, optional bullet details (see git log)

### PR Workflow (required)

All changes must go through pull requests. Direct pushes to `main` are blocked.

1. Create a feature branch: `git checkout -b <descriptive-branch-name>`
2. Make changes, commit to the branch
3. Push branch and create PR: `git push -u origin <branch> && gh pr create`
4. CI runs automatically: build on Node 20 + 22, AI code review on PRs
5. Once CI passes, merge the PR: `gh pr merge --squash --delete-branch`

Branch naming: use short descriptive names like `fix/admin-student-access`, `feat/daily-recap-email`, `chore/update-deps`.

## What to Be Careful With

- **`src/lib/prompts.ts`** — The conversation prompts are carefully tuned from user testing. Read `docs/conversation-design.md` before modifying.
- **`src/lib/level-progression.ts`** — Complex state machine with specific thresholds from learning science research. Read `docs/level-progression.md` before modifying.
- **Onboarding flow** — Multi-phase (interest interview + reading level assessment). Read `docs/student-onboarding.md` before modifying.
- **Content safety** — 3-layer filtering system. Read `docs/content-safety.md` before modifying.

## Docs

| Doc | What It Covers |
|-----|---------------|
| `docs/product-requirements.md` | Authoritative PRD |
| `docs/product-boundary.md` | What SigmaRead is and isn't |
| `docs/conversation-design.md` | AI conversation rules, 6 styles, scoring rubric |
| `docs/level-progression.md` | Gradual Mix level system |
| `docs/article-pipeline.md` | Morning batch generation |
| `docs/content-policy.md` | Three Bucket content framework |
| `docs/content-safety.md` | 3-layer content filtering |
| `docs/student-onboarding.md` | Onboarding walkthrough |
| `docs/admin-interface.md` | Admin capabilities |
| `DEPLOYMENT.md` | Live URLs, test credentials, env vars |
