# SigmaRead Task-Based Test Scenarios

Each scenario is a specific task a real user would perform. Simulated testers execute the task, and I log every friction point, confusion, and failure.

---

## Student Scenarios

### S1: First Login (Marcus — eager beginner, L1)
**Task:** Log in for the first time, complete onboarding, read first article, complete comprehension conversation.
**Success criteria:** Completes full loop in under 15 minutes. Doesn't get stuck or confused.
**Watch for:** Onboarding clarity, article difficulty appropriateness, conversation tone for young reader.

### S2: Reluctant Reader Session (Jayden — L2)
**Task:** Log in, pick an article, try to speed through with minimal effort.
**Success criteria:** Conversation handles low-effort responses without becoming tedious. Completes in 3 turns.
**Watch for:** Does the app punish disengagement? Does it feel like a chore? Would Jayden come back tomorrow?

### S3: Power User Flow (Sofia — advanced, L4)
**Task:** Log in, read all available articles, request more, complete multiple conversations in one sitting.
**Success criteria:** "More articles" provides new content. Conversations feel appropriately challenging. No dead ends.
**Watch for:** Content running out, repetitive questions, lack of challenge at L4.

### S4: Interest Mismatch (Liam — outdoors kid, L2)
**Task:** Log in and encounter an article that doesn't match interests. React naturally.
**Success criteria:** Student has a way to signal disinterest (dislike button). Next batch reflects feedback.
**Watch for:** Does the like/dislike system influence future articles? Can a student skip?

### S5: Return Visit (Emma — L3, day 2)
**Task:** Log in the next day. See what's new. Pick up where she left off.
**Success criteria:** Clear sense of progress. New content available or clear path to get more.
**Watch for:** Stale content, no sense of "what's next," confusing state from yesterday's session.

### S6: Vocabulary Challenge (Diego — bilingual, L2)
**Task:** Encounter an unfamiliar word while reading. Try to look it up.
**Success criteria:** Click-to-define works and provides a clear, context-appropriate definition.
**Watch for:** Discoverability of the define feature, definition quality, disruption to reading flow.

---

## Guide Scenarios

### G1: Morning Check-In (Calie — daily monitor)
**Task:** Log in at 8 AM. Determine which students need attention today.
**Success criteria:** Can identify struggling students in under 60 seconds.
**Watch for:** Visual hierarchy — do important signals stand out? Is the student list sorted helpfully?

### G2: Deep Dive on Struggling Student (Calie → Marcus)
**Task:** Marcus scored 45 on his last session. Investigate why and decide what to do.
**Success criteria:** Can read the report, understand the gap, and decide on next steps within 2 minutes.
**Watch for:** Report quality, transcript usefulness, actionable information.

### G3: First-Time Guide Setup (Rachel — new homeschooler)
**Task:** Log in for the first time. Add her two kids. Understand what the dashboard shows.
**Success criteria:** Can add students and understand the interface without help.
**Watch for:** No guide onboarding exists yet. Is the interface self-explanatory?

### G4: Weekly Review (Tom — 15 students)
**Task:** Friday afternoon review. Which students improved this week? Which declined? Who's inactive?
**Success criteria:** Can complete the review in under 10 minutes for 15 students.
**Watch for:** Dashboard scaling, summary metrics, sorting/filtering needs.

### G5: Quick Check (David — hands-off dad)
**Task:** Open the app on his phone. Is his daughter doing okay?
**Success criteria:** Gets a clear yes/no signal in under 30 seconds.
**Watch for:** Mobile usability, information density, quick-glance readability.

### G6: Trust Verification (Rachel — skeptical parent)
**Task:** Read exactly what her kid read and said in the comprehension conversation. Verify the AI behaved appropriately.
**Success criteria:** Can find and read the full transcript easily. Content and AI responses feel trustworthy.
**Watch for:** Transcript access, article content quality, AI tone in conversations.

---

## Evaluation Rubric

For each scenario, log:
1. **Task completion:** Did they finish? How long?
2. **Friction points:** Where did they hesitate, get confused, or fail?
3. **Emotional state:** Would this feel rewarding, neutral, or frustrating?
4. **Scope check:** Does fixing this friction strengthen the core loop?
5. **Priority:** P0 (blocking), P1 (painful), P2 (annoying), P3 (polish)
