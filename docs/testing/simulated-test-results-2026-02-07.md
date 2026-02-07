# Simulated User Testing Results — 2026-02-07

Tested against live production: https://sigma-reader.vercel.app
Tester: Cole (automated browser walkthrough)

---

## Scenarios Completed

### S1: First Login (Alex Rivera — new student, Gr 5, L3)
**Task:** Create account → onboarding → first article → conversation → self-assessment → home
**Result:** ✅ Complete loop successful

**Findings:**
- Onboarding works smoothly. "Tell me 3 interests" → profile saved → articles served instantly
- Welcome page: "Hey Alex Rivera 👋" with "Pick an article below to get started" — clear and inviting
- 3 articles served on first load (2 News, 1 Explore) — appropriate mix
- Article quality good — India Moon landing at L3, ~300 words, age-appropriate
- Pre-reading prompt good: "What do you know about why scientists want to explore the moon?"
- ✅ Conversation 3-step structure works: main idea → meaning → reasoning
- ✅ AI questions are meaning-based, not fact-recall
- ✅ AI wrap-up is specific: "You clearly got how this landing opens up possibilities for future exploration"
- ✅ Self-assessment → auto-navigate home works
- ✅ Completed article moves to "Already Read", count updates ("You've read 1 article")

**Issues Found:**
1. 🔴 **FIXED** — Article body rendered raw `# Title` heading (duplicate of styled header). Fixed: h1 headings now stripped from body.
2. 🟡 **FIXED** — AI opening said "Nice that you enjoyed it!" despite ban on filler. Fixed: liked/disliked prompt now says "Do NOT comment on this."

**Friction points:** None significant. Flow is intuitive for a first-time user.
**Emotional state:** Would feel rewarding. Clear progress, quick loop.

---

### S2: Reluctant Reader (Jayden — L2, low effort)
**Task:** Read article, give minimal-effort answers, see how AI handles disengagement
**Result:** ✅ Conversation completed without feeling punitive

**Findings:**
- Jayden's home: 1 article left, 4 already read — clear state
- Article: "The Mystery of Raining Fish" — engaging topic, good hook
- Clicked "No" (disliked) → conversation opened with "So what was this one about?" — no filler ✅
- Low-effort answer "idk fish falling from the sky or something" → AI: "Yeah, fish literally dropping out of the sky during storms. What struck you about *how* that actually happens?" — acknowledged without punishing, redirected well
- Second answer "like a tornado thing picks them up i guess" → AI: "Right — waterspouts suck them up from the water." — accepted the informal language, moved to reasoning
- Third answer "no idea" → AI: "Fair enough — it's because they're similar weight, so they fall together. You got the core idea about waterspouts causing it, which is the main point." — gave the answer, acknowledged what they DID know, wrapped up without lecture

**Issues Found:**
3. 🟡 **Markdown emphasis renders as raw text** — AI used `*how*` which shows as literal asterisks in the chat UI. Need to either: (a) render markdown in chat messages, or (b) add prompt rule banning markdown formatting.
4. 🟡 **Article may be too long for L2** — "The Mystery of Raining Fish" appeared to be 400+ words. L2 target is 200-300. This is a pre-existing cached article from the old generation run — may need cache audit.

**Friction points:** None for the student. The conversation handles disengagement gracefully.
**Emotional state:** Neutral — not punishing, not tedious. A reluctant kid would tolerate this.

---

## Guide Scenarios Tested (Quick Visual Audit)

### G1: Morning Check-In (Dashboard)
- ✅ Struggling students surface first (Marcus: 54, Liam: 59 — red "Struggling" badges)
- ✅ Score /100 labels clear
- ✅ Grade + reading level shown: "Gr 5 · L3"
- ✅ Status badges work: Struggling / On Track / Succeeding / New
- ✅ Search filter works
- ✅ Weekly Summary modal accessible

### G2: Deep Dive on Struggling Student
- ✅ Student detail page: 4-column stats (Grade, Reading Level, Sessions, Interests)
- ✅ Score trend chart
- ✅ Session list with /100 scores, like/dislike indicators, arrow affordance
- ✅ Session detail: score + self-assessment side by side with calibration flags
- ✅ Comprehension report: Understood (green) / Missed (red) / Engagement
- ✅ Chat-style transcript — AI on left (gray), student on right (blue)
- ✅ "← Back to [Name]" navigation

### G3: First-Time Guide Setup (Add Student)
- ✅ Form has Full Name, Grade (dropdown), Age, Username, Password
- ✅ Grade sets initial reading level automatically
- ✅ Student appears on dashboard immediately after creation

---

## Bugs Fixed During Testing

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | P1 | Article body rendered raw `# Title` as text | Strip h1 headings in renderBody() |
| 2 | P1 | AI said "Nice that you enjoyed it!" despite filler ban | Changed prompt: "Do NOT comment on liked/disliked" |
| 3 | P2 | Grade/level duplication on dashboard ("Gr 5 · Reading L3 · Gr 5-6") | Use short level label when grade is set |

## Open Issues

| # | Severity | Issue | Recommendation |
|---|----------|-------|----------------|
| 3 | P2 | Markdown `*emphasis*` renders as raw asterisks in chat | Add prompt rule: "Never use markdown formatting" OR render markdown in chat bubbles |
| 4 | P2 | Some L2 articles may exceed 300-word target | Audit article cache word counts, regenerate outliers |

## Summary

The core student loop (read → like/dislike → conversation → self-assess → home) is solid. The 3-step conversation structure is working well — meaning-based questions, no empty praise, handles both engaged and reluctant readers appropriately. The guide experience now has proper score labels, grade context, and a real session detail screen with chat transcripts.

Biggest remaining quality issue: some cached articles may not match their level's word count targets.
