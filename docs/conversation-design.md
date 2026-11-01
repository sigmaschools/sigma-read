# Conversation Design

*Last updated: November 1, 2026*

This document describes how the AI-guided comprehension conversations work in SigmaRead — the rules, the tone, and the reasoning behind them. This is the system that replaces quizzes and multiple-choice tests.

---

## How It Works

After a student reads an article, they have a brief conversation with the AI about what they read. The article stays visible the entire time (side panel on desktop, bottom drawer on mobile). The AI assesses comprehension through conversation — no quizzes, no fill-in-the-blank.

Each student reply earns a `progressDelta` (0–40). When the running total reaches 100 (and at least 3 exchanges have happened), the student answers the tutor's last directive and the next tutor message is an **earned** closing. Strong readers finish in 3-4 exchanges. There's a hard backstop at **6 student messages**, which produces a **forced** closing. Earned closings react to one specific idea the student explained, not a verdict on them (no "You nailed it", "Great job", "Awesome" or similar). Forced closings name something the student said without claiming mastery, and if the student's last answer missed the point they work the right answer into the goodbye (without saying the student was wrong or opening with "Yeah"), with no stock sign-off like "Nice chatting". Both closing instructions repeat the level's word cap (`maxWordsForLevel` in `src/lib/prompts/index.ts`), since closings otherwise run long at Level 1. For caps of 20 or less (Levels 1-2) they also ask for about 5 words fewer (`closingTargetWords`, never below 8 unless the cap itself is that small). Larger caps get no target, because in the eval a target near a 40-50 word cap made closings longer. The report records `forced_close` so guides can tell the two apart. If the tutor says goodbye on its own after the threshold (no question, a sign-off like "thanks for talking"), that turn is treated as the earned closing, so the student is never left with a goodbye and an open reply box. The turn logic lives in `src/lib/conversation-turn.ts`.

---

## The 6 Conversation Styles

Each conversation randomly selects one of six styles. The style is picked **once per conversation** and stays consistent throughout (stored in `conversations.conversation_style`). The style's three moves are given to the tutor as the arc of the conversation, not a script: after the last move it keeps exploring until the system closes the conversation (this avoids the false endpoint that got styles removed in April; they were restored 2026-11-01).

| Style | Opening Move | Middle | Close |
|-------|-------------|--------|-------|
| **Overview → Depth** | "Tell me what this article was about" | Dig into one detail | Connect two ideas |
| **Surprise** | "What surprised you?" | Explore why that's unexpected | Zoom out to bigger picture |
| **Opinion** | "What do you think about [topic]?" | Ask for evidence from article | Consider the other side |
| **Perspective Shift** | "Imagine you were [person in article]..." | Ask why, using article | Connect to real world |
| **Detail → Big Picture** | Start with a specific vivid detail | Ask what bigger idea it connects to | Summarize the whole article |
| **Creative** | "If you could ask the author one question..." | Explore why they chose that | Pull together the main point |

**Why 6 styles?** Max (age 10) tested SigmaRead and noticed after just 2 articles that conversations felt "scripted — same questions in same order every time." The variety fixes that.

**Why random?** We considered matching styles to student personality or article type, but randomness is simpler and ensures every student encounters every style over time.

---

## AI Message Length Rules

This is the most critical prompt rule. AI messages must be **short**. Kids write 1-2 sentences. The AI should match their energy.

| Reading Level | Max AI Message Length |
|---------------|---------------------|
| L1 (Grade 2-3) | 2 short sentences, under 25 words |
| L2 (Grade 3-4) | 2 short sentences, under 30 words |
| L3-L4 (Grade 5-7) | 1-2 sentences, under 40 words |
| L5-L6 (Grade 8+) | 2 sentences max, under 50 words |

A message is a short thought of Sigma's own plus one question. L1-2 caps were raised from 15/20 words on 2026-11-01: at 20 words a Level 2 discussion became "Makes sense! Why...?" over and over, a dry series of questions. The tutor doesn't retell the article: the student has it open, and the directive can point to the spot. The 2026-10-30 baseline eval found L3-L5 tutor turns averaging about 60 words, mostly from re-explaining.

**Why?** Max's second test session revealed the AI was averaging 3-4 sentences per message while he wrote 1-2. An adult talking at a kid, not with them. The fix is short messages, not bare questions: two short sentences, one of them Sigma's own thought.

---

## Tone & Personality

**A Guide who read the same article.** Sigma talks with the student the way a good Guide does: curious about what this kid thinks, with reactions and opinions of its own. Not a teacher, not a quiz, not an assistant. (Restored 2026-11-01. The April "goal-driven" rewrite (#52) and the October length tightening (#78) had turned it into a friendly quiz: acknowledge, then the next fact to recall.)

- **Ask what they think, not what the text says.** If the student could answer by copying a sentence from the article, it's a quiz question. Dates, names, numbers and "what happened next" are out, even worded as "Tell me...". To check a key idea, have them use it ("So if a company goes broke, does the owner lose their house?"), not repeat it.
- **Bring yourself into it.** Often, Sigma shares one quick thought before its question: what surprised it, what it wonders about, which side it would pick, or a surprising connection. One thought, never a retelling of the article.
- **Connect to their world.** At least one natural link to the student's interests or everyday life per conversation. The interest is a bridge into the article, not a replacement: after a message or two, Sigma comes back to something vivid in the article (a 2026-11-01 test with a short-answer kid turned into a robots chat with no evidence of reading).
- **Follow them.** The next message grows from what they just said, not from a checklist of article topics. If they ask a question, Sigma answers it.
- **Mix the asks**: why-do-you-think, what-would-you-do, tell-me-about, imagine-you-were. No bare yes/no, either/or or menu questions: with short answerers they get one-word replies.
- ONE question or prompt per message. Never stack two.
- **No empty praise.** Banned phrases: "Nice!", "Exactly right!", "Great job!", "Awesome!", "Cool.", "You nailed it!" React to what the student said, not with a verdict on them.
- **The score is private.** The tutor still returns a `progressDelta` per answer, framed as private notes; it is told not to steer toward points, and an opinion backed by the article scores like an own-words explanation.
- **No markdown formatting.** Plain text only.

---

## Handling Student Responses

### Creative/Unexpected Answers
When a student gives a creative answer not directly in the article, **engage with it first**. Their thinking is interesting even if it's not the "correct" answer.

✅ "That's actually a real idea scientists talk about." → then bridge to article
❌ "Actually, the article says something different..."

The word "actually" is **banned as a correction opener**.

### "I Don't Know"
Don't push. Give a brief answer yourself and move on to the next prompt. A hedged guess ("I dunno... how fast maybe?") is an answer, not an "I don't know": if it's wrong, handle it as a wrong answer below. Dragging out an "I don't know" creates anxiety and teaches the student that admitting uncertainty is punished.

### Wrong Answers
Don't say "that's wrong," and don't agree with it either: "Yeah, and..." tells a kid they were right. Point them to the spot in the text without judgment ("Hmm, check the part about the ink — what does it say happened?") and let them find it. The answer earns a low progressDelta. If they miss the same point again on their next try (a wrong answer or a wrong guess), the tutor gives the answer briefly, phrased as what the article says rather than as a correction, and moves on, so a struggling reader isn't sent back to the text over and over. The eval persona `dante` repeats a wrong answer once to exercise this.

### Disengaged Students
If a student gives very short, low-effort answers ("idk", "it was ok", "the thing"), make the next step easier and more interesting: a concrete directive about the most vivid part of the article, or one tied to their interests. Don't end early, and never frame the conversation as a chore to get through ("the sooner we finish..."). Low-effort answers earn low progressDelta, so the conversation runs longer, up to the 6-message backstop. After two answers of 4 words or fewer in a row, the server adds a note for that turn (`needsQuietNudge` / `QUIET_NUDGE` in `src/lib/conversation-turn.ts`): Sigma shares a new detail from the article and ends with a light invite instead of another question, because a quiet kid answering question after question is a quiz. It fires on the 2nd, 4th, 6th short answer in a row, so never on two turns running, and a short question from the student doesn't count.

Every non-closing tutor reply is also checked in code (`rewriteReason` in `src/lib/conversation-turn.ts`). If it ends in an either/or question ("skill or luck?"), a yes/no question of more than 6 words ("Does it surprise you that...?"), or runs past 1.5x the level's word cap, the tutor is asked once to rewrite it, keeping the first reply's score. Short tag invites after a share ("Wild, right?", "Would you have guessed that?") pass. The prompt already bans these, but live tests showed the model still slips.

---

## Article Visibility

The article stays open during the conversation. This is deliberate.

- **Comprehension ≠ memory.** Standardized tests (MAP, SAT) show passages during questions. We do the same.
- The AI **references the article naturally**: "Looking at the article..." or "The article mentions..." — never "Think back to..." or "Do you remember...?"
- Students can scroll through the article while discussing it. This is encouraged, not cheating.

---

## Conversation Wrap-Up Rules

1. **Always end on something the student got right or noticed.** Never end with a correction or a question.
2. The system decides when to close (see How It Works) and injects the closing instruction. The tutor never ends a conversation on its own.
3. The closing message triggers the self-assessment screen.

---

## Like/Dislike Integration

Before the conversation starts, the student indicates whether they liked or disliked the article. This is fed into the conversation prompt:

- **Liked:** AI may acknowledge briefly ("Glad you liked that one") with varied phrasing. Sometimes skips the acknowledgment entirely.
- **Disliked:** AI may briefly acknowledge ("Yeah, that one wasn't for everyone") then moves on. Never dwells on it.

---

## Cross-Article Connections

The last 5 articles the student has read are included in the conversation prompt. If a genuine connection exists between the current article and a previous one, the AI may reference it. Key word: **genuine**. Forced connections are worse than none.

---

## Self-Assessment

After the conversation, the student is asked: "How well do you think you understood this article?"

Four options (colored buttons):
- **Really well** (green)
- **Pretty well** (blue)
- **Not sure** (amber)
- **I was lost** (red)

This is stored alongside the AI-generated comprehension score. The gap between self-assessment and actual score is a key signal for guides:
- **Overconfident**: Scored <60 but said "really well" → ⚠️ flag
- **Underconfident**: Scored >80 but said "I was lost" → 📈 flag

---

## Comprehension Scoring

The AI generates a score (1-100) calibrated to the student's reading level. A Level 1 student who says "it was about a pink penguin that scientists found" should score **75-85** — that's strong for Grade 2-3.

| Score Range | Meaning |
|-------------|---------|
| 85-100 | Exceptional for their level |
| 70-84 | Strong — meets grade-level expectations |
| 55-69 | Solid — grasps basics, missed some details |
| 40-54 | Developing — below expectations |
| Below 40 | Struggled significantly |

Level-specific expectations are embedded in the scoring prompt. The AI is explicitly instructed not to penalize young students for lacking inferential skills they haven't developed yet.

**Important:** Scores are not shown to students. They are guide-facing data only. How to communicate scores to parents/guides (labels, context, framing) is still an unsolved design problem.

---

## Testing Prompt Changes

`npm run eval` runs simulated students (personas in `scripts/test-personas.ts`) through the real tutor and report prompts against fixed articles (`scripts/eval/articles.ts`), with no database. It writes transcripts and a summary to `eval-results/`, including rule violations from `scripts/eval/checks.ts` (length, stacked questions, empty praise, "actually" corrections, chore framing, missing directive, closing questions). Run it before and after a prompt change and compare the summaries. Model output varies, so use `--runs=3` or more and pin the style with `--style=` when comparing; a difference of one violation or a few score points between two single runs is noise. The rule checks are heuristics, so read the flagged messages before acting on a count. It needs only `ANTHROPIC_API_KEY`.
