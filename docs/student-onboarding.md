# Student Onboarding

*Last updated: February 8, 2026*

---

## Overview

When a new student first logs in, they go through a brief onboarding flow that explains how SigmaRead works and captures their interests. The entire process takes **under 2 minutes**.

---

## Step 1: Product Walkthrough (3 screens)

A simple 3-screen walkthrough that sets expectations:

| Screen | Content |
|--------|---------|
| 📚 **Welcome** | "You'll read short articles picked just for you" |
| 💬 **Discuss** | "After reading, you'll have a quick discussion about what you read" |
| ✅ **That's it!** | "Read, discuss, done. Let's get started" |

- Progress dots show which screen you're on
- "Next" button advances through screens
- Final screen says "Let's go" instead of "Next"
- Ultra-concise, kid-friendly copy. No jargon. No walls of text.

**Replay:** The walkthrough can be replayed anytime via the user dropdown menu → "Welcome" (adds `?demo=true` to the URL, which replays without resetting the student's data).

---

## Step 2: Interest Interview (AI Conversation)

After the walkthrough, the AI (named "Sigma") has a brief conversation to learn the student's interests.

**Flow:**
1. AI introduces itself and asks for 3 interests
2. Student responds
3. AI acknowledges briefly and wraps up — **2 exchanges total, that's it**

**Example:**
> **Sigma:** Hi Emma, I'm Sigma. SigmaRead gives you articles matched to your interests. Tell me three things you're interested in — hobbies, topics, sports, whatever you like.
>
> **Emma:** I like dogs, drawing, and space
>
> **Sigma:** Cool. I'll start putting together some articles for you.

**Rules:**
- One question per message. Never stack multiple questions.
- 1-2 sentences per AI message. Respect the student's time.
- No forced enthusiasm ("Awesome!", "That's so cool!")
- Accept whatever the student says without judgment
- Inappropriate interests are silently filtered (see [Content Safety](./content-safety.md))
- Speech-to-text is expected — informal language is fine

**Output:** The AI generates a structured interest profile:
```json
{
  "primary_interests": ["dogs", "drawing", "space"],
  "secondary_interests": ["animals", "art", "astronomy"],
  "notes": "Visual/creative learner based on drawing interest"
}
```

---

## Step 3: Initial Article Delivery

Immediately after onboarding completes:
- Student's reading level is set to **Level 2** (default — calibrates from first conversation)
- **12 articles** are pre-filled from the cache into the student's buffer
- Student lands on their home screen with 3 articles ready to go
- **Zero delay** — articles are available instantly

The grade level (set by the guide when creating the account) will be used for future calibration, but the initial default is always L2 to avoid starting too hard.

---

## What Guides Do

Guides create student accounts with:
- Full name (human-readable — no "teststudent" or "student1")
- Username
- Password
- Grade level (auto-suggests a reading level)
- Age

The guide does NOT set interests or reading level. Those come from the student's own onboarding experience.

---

## Un-Onboarded Students

Students who haven't completed onboarding see the walkthrough + interest interview when they log in. They cannot access the main app until onboarding is complete.

Some test students are intentionally left un-onboarded for testing the onboarding flow.

---

## Grace Period

After onboarding, the first **3 sessions** are a grace period — no level progression evaluation, no probing. The system gathers baseline data before making any adjustments. The student's initial reading level (L2 default) holds during this period.
