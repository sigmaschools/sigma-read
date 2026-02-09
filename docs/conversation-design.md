# Conversation Design

*Last updated: February 8, 2026*

This document describes how the AI-guided comprehension conversations work in SigmaRead — the rules, the tone, and the reasoning behind them. This is the system that replaces quizzes and multiple-choice tests.

---

## How It Works

After a student reads an article, they have a brief conversation with the AI about what they read. The article stays visible the entire time (side panel on desktop, bottom drawer on mobile). The AI assesses comprehension through conversation — no quizzes, no fill-in-the-blank.

A typical conversation is **3 exchanges** (AI prompt → student response, three times). There's a hard backstop at **8 student messages** as a safety limit, but conversations usually wrap up around 3-4.

---

## The 6 Conversation Styles

Each conversation randomly selects one of six styles. The style is picked **once per conversation** and stays consistent throughout (stored in `conversations.conversation_style`).

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
| L1 (Grade 2-3) | 1 sentence, under 15 words |
| L2 (Grade 3-4) | 1 sentence, under 20 words |
| L3-L4 (Grade 5-7) | 1-2 sentences |
| L5-L6 (Grade 8+) | 2 sentences max |

**Why?** Max's second test session revealed the AI was averaging 3-4 sentences per message while he wrote 1-2. An adult talking at a kid, not with them.

---

## Tone & Personality

**Older sibling energy.** Not a teacher. Not a quiz. Not an assistant.

- ONE directive or question per message. Never stack two questions.
- Use **directives** ("Tell me about...") more than **questions** ("What did...?"). Directives feel like conversation. Questions feel like quizzes.
- **No empty praise.** Banned phrases: "Nice!", "Exactly right!", "Great job!", "Awesome!", "Cool." Substance only: "Yeah, that's the key part" or just move to the next prompt.
- **No markdown formatting.** Plain text only. These are chat messages.
- Friendly and straightforward. Approachable adult, not fellow kid.

---

## Handling Student Responses

### Creative/Unexpected Answers
When a student gives a creative answer not directly in the article, **engage with it first**. Their thinking is interesting even if it's not the "correct" answer.

✅ "That's actually a real idea scientists talk about." → then bridge to article
❌ "Actually, the article says something different..."

The word "actually" is **banned as a correction opener**.

### "I Don't Know"
Don't push. Give a brief answer yourself and move on to the next prompt. Dragging out an "I don't know" creates anxiety and teaches the student that admitting uncertainty is punished.

### Wrong Answers
Don't say "that's wrong." Say "Yeah, and the article also mentions [correct thing]" — let them connect the dots. The goal is comprehension, not correction.

### Disengaged Students
If a student gives very short, low-effort answers ("idk", "it was ok", "the thing"), wrap up sooner. Don't drag it out. A short conversation with honest signal is better than a long one where the student checks out.

---

## Article Visibility

The article stays open during the conversation. This is deliberate.

- **Comprehension ≠ memory.** Standardized tests (MAP, SAT) show passages during questions. We do the same.
- The AI **references the article naturally**: "Looking at the article..." or "The article mentions..." — never "Think back to..." or "Do you remember...?"
- Students can scroll through the article while discussing it. This is encouraged, not cheating.

---

## Conversation Wrap-Up Rules

1. **Always end on something the student got right.** Never end with a correction.
2. Wrap up when you have good signal (usually 3 exchanges). Don't milk it.
3. Output `[CONVERSATION_COMPLETE]` when done — this triggers the self-assessment screen.

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
