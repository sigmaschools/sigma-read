# SigmaRead — Claude Code Instructions

AI-powered reading comprehension for K-8 students. Kids read nonfiction articles matched to their interests and level, then discuss them with an AI tutor. No quizzes.

## Commands

```bash
npm run dev          # Local dev server
npm run build        # Production build (use to verify changes)
npm run lint         # ESLint (pre-existing warnings, non-blocking in CI)
npm test             # Plain-assert *.test.ts files under src/ and scripts/ (runs in CI)
npm run eval         # Offline simulated-student conversation eval (needs ANTHROPIC_API_KEY, no DB)
npx drizzle-kit push # Push schema changes to DB
npx tsx scripts/<name>.ts  # Run utility scripts (requires DATABASE_URL; add --require ./scripts/md-require.cjs if it imports src/lib/prompts)
```

No test framework: `*.test.ts` files are plain `node:assert` scripts. Verify changes with `npm test` and `npm run build`. Before and after any change to the conversation or report prompts, run `npm run eval` and compare the summaries.

## Environment Variables

- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key
- `JWT_SECRET` — JWT signing secret
- `COMPASS_URL`, `COMPASS_INTERESTS_KEY` — optional, Compass interests API (see docs/interest-graph.md)
- `SEED_PASSWORD` — only when running a seed script: the password the accounts it creates get

## Secrets

Never write a password, API key, token or connection string with a password into any file: code, docs, scripts, comments, tests or logs. Docs list usernames and roles only; passwords live in the team's password manager and keys in Vercel's environment variables. Seed scripts read the password they set from `SEED_PASSWORD` (`scripts/seed-password.ts`). CI runs `scripts/check-no-credentials.sh` on every PR and fails on the usual shapes of a written credential (a Password column, an "email / password" pair, a password literal or one built from a literal, key formats, private keys, database URLs with a password); it cannot catch a password written as plain prose, so the rule still applies; a deliberate fake in a test ends its line with `credential-check: allow`. A credential that reaches the repo must be changed, not just deleted, because git history and clones keep it.

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
      schema.ts    # Every table — the authoritative data model
    prompts.ts     # All AI system prompts (~26KB) — handle with care
    level-progression.ts  # Gradual Mix level system — complex, well-documented
scripts/           # Utility scripts (cache, seed, simulate)
docs/              # Product docs, conversation design, testing guides
```

## Key Conventions

@PATTERNS.md

Additional rules:

- **AI models**: one model per job in `src/lib/models.ts` (`MODELS.tutor`, `report`, `writer`, `standard`, `light`); never hardcode a model id in a route. Build requests with `forJob(job, body)` (or spread `requestSettings(model, job)`) so thinking/effort settings come along. Why each model was chosen, and how to re-test: `docs/ai-models.md`. The eval scripts pin their student simulator to a fixed model, so a model change in the app doesn't change the simulated students
- **Auth pattern**: Every API route checks `getSession()` first, returns 401 if missing
- **All API routes**: Must `export const dynamic = "force-dynamic"` when authenticated
- **Imports**: Use `@/` path alias (maps to `src/`)
- **CSS**: Use CSS variables (`--fg`, `--muted`, `--accent`, `--border`, `--surface`), not hardcoded colors
- **DB changes**: Edit `src/lib/db/schema.ts` and add an idempotent, additive SQL file `drizzle/NNNN_name.sql` (`IF NOT EXISTS`, end every statement with `;` at the end of a line, with no trailing comment, no `$$` blocks, no `CONCURRENTLY`). New columns must be nullable or have a default, since the old code keeps serving while the new deploy builds. Production deploys apply pending files automatically before `next build` (`scripts/migrate.mjs`, tracked in `schema_migrations`). For dev, `npx drizzle-kit push` or `MIGRATE=1 node scripts/migrate.mjs`. Write migration files by hand (or hand-edit `drizzle-kit generate` output to be idempotent); never use `drizzle-kit migrate`. Promoting a preview deploy skips migrations (it reuses the build). Drops and renames are not automatic: do them manually, after the code stops using the column
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
| `docs/article-pipeline.md` | Morning batch generation, article sharing and duplicate checks |
| `docs/ai-models.md` | Which model does each job, the tests behind it, costs |
| `docs/content-policy.md` | Three Bucket content framework |
| `docs/content-safety.md` | 3-layer content filtering |
| `docs/student-onboarding.md` | Onboarding walkthrough |
| `docs/admin-interface.md` | Admin capabilities |
| `docs/article-selection.md` | Cache to feed, daily cap, the student's local day |
| `docs/session-analytics.md` | What is tracked per session, diagnostic queries |
| `docs/compass-integration.md` | Running inside Compass: in-page reports, the reading day, the interest graph link |
| `docs/compass-api.md` | Read-only `/api/v1` for Compass: keys, scopes, endpoints |
| `docs/interest-graph.md` | Topic map, interest signals, decayed affinities |
| `DEPLOYMENT.md` | Live URLs, test credentials, env vars |
