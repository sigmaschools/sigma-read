# SigmaRead — Product Requirements

**Last updated:** February 8, 2026
**Status:** MVP deployed, iterating based on founder + user testing
**Live:** https://sigma-reader.vercel.app

---

## What Is SigmaRead

A beautifully designed reading comprehension app where kids read nonfiction articles matched to their interests and reading level, then have a brief AI conversation about what they read. The AI assesses comprehension through conversation — no quizzes, no multiple choice. Guides (parents, teachers, tutors) get honest signal about what each student understood and what they missed.

SigmaRead is one module inside Sigma's broader Compass education platform.

## Core Principles

1. **Personalization over standardization** — every student's experience is unique
2. **Comprehension over completion** — understanding matters more than finishing
3. **Simplicity over features** — one path forward, minimal cognitive load
4. **Honesty over encouragement** — real signal for guides, not inflated metrics
5. **Joy over obligation** — reading should feel like a pleasant part of the day
6. **Accuracy over speed** — no hallucinated facts, ever

## Design Reference

Design decisions draw from **Todo/Kanban apps** (cards moving from available → completed). Not social media feeds, not gamified education apps. The interface should feel like something you'd want to read in.

Clean, minimal, calm. Think Apple Notes, iA Writer, Linear. **Not** Duolingo, not Khan Academy, not a school LMS. No mascots, no cartoons, no bright primary colors. Typography-forward.

---

## The Core Loop

```
Student sees 3 articles → Picks one → Reads it (article visible throughout) →
"I'm done reading" → Like/dislike → Conversation with AI (3 turns) →
Self-assessment → Auto-navigate home → Goal slot fills
```

Each step flows automatically to the next. No extra buttons or decisions. Students should always have **one path forward**.

A complete session takes **2-5 minutes per article** including the conversation.

---

## Users

### Students (Grade 2–8, age 7–14)
- Sigma School students initially, homeschool students for expansion
- All reading levels and motivation levels
- Need: content they actually want to read + a low-friction assessment experience
- **Students never see scores.** Conversational AI feedback is their signal.

### Guides (parents, teachers, tutors)
- Need: at-a-glance signal on who's succeeding and who's struggling
- Need: honest comprehension data, not inflated metrics
- Some influence over content direction, not full editorial control
- Check-in patterns vary from daily to weekly

### NOT for:
- Schools wanting same-pace, whole-class instruction
- Schools wanting full editorial control over student reading material

---

## Reading Levels

| Level | Grade | Lexile | Article Length | Vocabulary |
|-------|-------|--------|---------------|------------|
| 1 | 2-3 | ~400-500 | 100-200 words | Simple, common words. Max 1 challenging word per paragraph, defined in sentence. |
| 2 | 3-4 | ~550-650 | 200-300 words | Mostly common. 1-2 topic-specific words per paragraph, explained in context. |
| 3 | 5-6 | ~700-800 | 300-400 words | 2-3 challenging words per paragraph, each defined or contextually clear. |
| 4 | 7 | ~850-950 | 400-500 words | Domain vocabulary with context clues. No stacking technical terms in one sentence. |
| 5 | 8 | ~1000-1100 | 400-600 words | Domain-specific vocabulary supported by context. Complex sentences allowed. |
| 6 | 8+ | ~1150+ | 500-600 words | Advanced vocabulary. Assumes strong reader who handles nuance and inference. |

Level adjusts gradually over time using the **Gradual Mix** system — probe articles at adjacent levels validate readiness before any level change. See [`level-progression.md`](./level-progression.md) for the full system.

---

## Features

### Onboarding
- **Interest interview:** Brief AI conversation (2 exchanges max). AI asks for 3 interests, acknowledges, builds profile. Friendly and fast.
- **Initial calibration:** Student's grade level (captured at account creation) sets the default reading level. First article + conversation serves as calibration. No separate assessment phase.

### Student Home
- **Always shows exactly 3 articles** — the 3 most recent unread
- **"Show me different articles"** button swaps the entire set with 3 fresh articles from cache (not append — replace)
- Sticky top bar: SigmaRead logo + student name + sign out
- "Hey [name] 👋" greeting
- Article cards show: title (1 line), 2-sentence summary (140-180 chars), category label + topic + read time
- Card heights are consistent (min-h-120px, title clamp-1, summary clamp-2)
- **Daily reading goal (0/3)**: hidden until first article completed today, then shows completed article titles with ✓ checkmarks. No blank placeholder slots.
- Category labels: News (blue text), For You (violet), Explore (green) — text only, no badges
- If cache is exhausted, "Show me different articles" shows a friendly message

### Reader
- Clean, distraction-free reading view
- **Click any word** for AI-powered contextual definition (planned: + pronunciation audio button)
- Adjustable font size (A−/A+)
- **Sources collapsed** behind "Sources ▸" toggle
- **"I'm done reading"** button → inescapable modal (Yes/No only, no X to dismiss) → like/dislike → transition animation → conversation

### Comprehension Conversation
- **Article visible during conversation** — open by default. Desktop: side panel (440px, subtle gray bg). Tablet/mobile: floating "📖 Article" button opens bottom drawer overlay (65vh).
- This aligns with how standardized tests work (MAP, SAT both show passages during questions). Comprehension ≠ memory.
- **6 conversation styles**, randomly selected per conversation:
  1. Overview → Depth (big picture, then dig in)
  2. Surprise ("What didn't you know before?")
  3. Opinion ("What do you think about...?")
  4. Perspective Shift ("Imagine you were...")
  5. Detail → Big Picture (specific detail, zoom out to meaning)
  6. Creative ("If you could ask the author one question...")
- Conversations flow naturally — usually 3 exchanges. Hard backstop at 8 student messages (safety limit).
- **No progress dots.** The conversation just flows — student doesn't see the formula.
- AI references the article naturally ("Looking at the article..." / "The article mentions...") — never tests memory ("Think back to..." / "Do you remember...?")
- Like/dislike acknowledged naturally by AI (varied phrasing, sometimes skipped)
- Cross-article connections: last 5 read articles fed into prompt
- **Rules:** No empty praise. Directives over questions. Questions must be answerable from article text. "I don't know" → give answer, move on. No markdown formatting. Plain text only.

### Self-Assessment → Auto-Navigate
- "How well do you think you understood this article?" — 4 colored buttons (Really well/green, Pretty well/blue, Not sure/amber, I was lost/red)
- Click → "Thanks! 👍" → auto-redirect to home after 1.2 seconds
- Self-assessment stored in DB, surfaced to guides with calibration flags

### Guide Dashboard
- Student list sorted: **struggling students first**, then on-track, succeeding, inactive, new
- Each student shows: full name, reading level + grade, average score (color-coded), sessions this week/total, status badge
- Scores displayed as plain numbers (no "/100", no labels — score communication TBD)
- Status badges: Struggling (red), On Track (blue), Succeeding (green), Inactive (gray), New (purple)
- **Search/filter bar** for student list
- **Weekly Summary modal** (📊 button): overview stats, per-student breakdown sorted by score, alerts
- **Single batch API call** — no N+1 queries
- Sign out + guide name **fixed at bottom** of sidebar

### Student Detail (Guide)
- Session list: article title, date, score, self-assessment, liked/disliked
- Session detail: score + self-assessment side by side, comprehension report (understood/missed in green/red), chat-style transcript
- Self-assessment calibration flags: "⚠️ Overconfident" (scored <60 + said "really well"), "📈 Underconfident" (scored >80 + said "lost")
- Add student form: name, username, password, grade (auto-sets reading level), age

### Comprehension Reports
- Auto-generated after each conversation
- Score (1-100), rating, what understood, what missed, engagement note
- Self-assessment included (calibration gap is key signal)
- Scores are relative to reading level — a 70 at L2 ≈ 70 at L4

### Auth
- Internal accounts. Guide creates student accounts (username + password).
- Guide accounts use email login.
- No public signup, no SSO, no payment.

---

## Data Model

```
Guide (id, name, email, password_hash)
Student (id, name, username, password_hash, guide_id, reading_level, grade_level, age, interest_profile, onboarding_complete)
Article (id, student_id, title, topic, body_text, reading_level, sources[], read, liked, category, summary)
ArticleCache (id, title, topic, body_text, reading_level, sources[], category)
ReadingSession (id, student_id, article_id, started_at, completed_at)
Conversation (id, reading_session_id, messages[], complete)
ComprehensionReport (id, conversation_id, score, rating, understood, missed, engagement_note, self_assessment)
```

---

## Technical Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes (serverless on Vercel) |
| Database | Neon Postgres (free tier → Pro as needed) |
| Auth | Custom JWT (username/password, role-based) |
| AI Conversations | Anthropic Claude Opus 4.6 |
| AI Reports/Articles | Anthropic Claude Sonnet 4.5 |
| AI Planning/Definitions | Anthropic Claude Haiku 4.5 |
| Hosting | Vercel (`sigmascore` team, Pro plan) |

---

## What's Not in MVP

- Score communication strategy (labels, scales, or contextual framing — needs more thinking)
- Score trend visualizations (not enough data yet)
- Session completion targets ("12 of 15 expected")
- XP system (Compass-wide, not SigmaRead-specific)
- Pronunciation audio for definitions
- Dark mode reading option
- Weekly digest emails for guides
- Gamification, streaks, badges (explicitly rejected)
- Thumbnails/images on article cards (explicitly rejected — text-focused design)
- SSO / public signup / payment
- Native mobile apps
- Speech-to-text (handled by student's device)
- Full editorial control for guides
- On-demand topic search

---

## Success Metrics

| Metric | How Measured |
|--------|-------------|
| Reading comprehension growth | MAP tests 3x/year |
| Lexile level progression | Built-in tracking over time |
| Comprehension score trends | Per-student rolling averages |
| Zone of proximal development fit | Score distribution centered 60-75 |
| Student engagement | Sessions completed, time in app |
| Guide utility | Qualitative — do guides find the dashboard useful? |

---

## Competitive Position

SigmaRead gets to know your kid. No multiple choice. Kids discuss articles with an AI that genuinely assesses comprehension. They can look up any word and hear its pronunciation. We have a track record of improved MAP scores.

- vs. Khan Academy: Not personalized to your kid's interests
- vs. ChatGPT: Not designed for kids, no guide dashboard, no progress tracking
- vs. Newsela: Quiz-based assessment, not conversational. Requires teacher setup.
- vs. Reading Eggs: Gamified to the point of distraction. We focus on actual comprehension.

---

## Related Documentation

| Document | Covers |
|----------|--------|
| [Conversation Design](./conversation-design.md) | AI conversation rules, 6 styles, tone, scoring rubric |
| [Level Progression](./level-progression.md) | Gradual Mix system, competitive research, thresholds |
| [Article Selection](./article-selection.md) | Cache → buffer → feed pipeline, daily cap, feedback loops |
| [Article Pipeline](./article-pipeline.md) | Morning batch generation, Opus/Sonnet hybrid |
| [Content Policy](./content-policy.md) | Three Bucket framework, selection principles |
| [Content Safety](./content-safety.md) | 3-layer silent filtering system |
| [Student Onboarding](./student-onboarding.md) | Walkthrough, interest interview, initial delivery |
| [Session Analytics](./session-analytics.md) | What we track, diagnostic queries |
| [Admin Interface](./admin-interface.md) | Admin role and capabilities |
| [Product Boundary](./product-boundary.md) | What SigmaRead is and isn't |
