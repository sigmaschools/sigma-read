# Student Onboarding

*Last updated: November 1, 2026*

---

## Overview

When a new student first logs in, they chat with Sigma about what they like, see three short tutorial cards, and land on three articles about their interests. Target: under 2 minutes, at most 3 typed answers.

---

## Step 1: Interest chat (AI conversation)

The chat opens immediately (no screens before it). Prompt: `src/lib/prompts/md/interest-interview.md`.

**Flow:**
1. Sigma says hi and asks what they're into (one or two short sentences).
2. After each answer Sigma either outputs the profile (three specific interests) or asks ONE short follow-up: which games, anything else, or a few ideas if they don't know.
3. At most three student answers. After the third, the server tells Sigma to output the profile with whatever it has (`MAX_STUDENT_ANSWERS` in `src/app/api/onboarding/chat/route.ts`).

Before the first answer, the page shows tap-to-add topic ideas (Animals, Space, Sports, ...) that fill the text box.

**Example:**
> **Sigma:** Hi Emma, I'm Sigma. I'll pick articles just for you, and after you read one we'll talk about it, no tests. What are three things you're into, like Minecraft, soccer or dogs?
>
> **Emma:** games, dogs and drawing
>
> **Sigma:** Dogs and drawing, there's a lot to read there. Which games do you play the most?
>
> **Emma:** minecraft
>
> **Sigma:** Minecraft, dogs and drawing, got it! I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.
>
> *(A "Next: see how SigmaRead works" button replaces the input; the cards start when the student taps it.)*

**Personality:** older sibling energy (see [Conversation Design](./conversation-design.md)). The first and last messages are fixed copy in `src/lib/onboarding-copy.ts`: the opener says what SigmaRead is and asks for three interests; the wrap-up names the interests back and says the first articles are on the way. The chat then waits for the student to tap "Next" before the tutorial cards, so the wrap-up can be read. Sigma reacts to each answer in between with something specific instead of praise.

**Rules:** one question per message, short sentences, no empty praise, accept whatever the student says, never ask about the same thing twice. Inappropriate interests are silently filtered (see [Content Safety](./content-safety.md)).

**Output:** `{"interests": ["Minecraft", "dogs", ...]}` (specific words first). Saving it sets the reading level from the grade, records the interests in the interest graph, marks onboarding complete, and starts the starter articles.

---

## Step 2: Tutorial (3 cards)

| Card | Text |
|------|------|
| 📚 Articles picked for you | "Every day you'll get articles about things you like." |
| 💬 Then chat about it | "After you read, you'll chat with Sigma about it. It's not a test. The article stays open." |
| ✨ That's it | "Three articles a day. That's it." |

The last card's button reads "Getting your articles ready…" (with "1 of 3 ready") until the starter articles are done, then "Show me my articles". It stops waiting after 150 seconds either way. If the student reloads while articles are still coming, the home page sends them back to the cards (`/student/onboarding?cards=1`).

There is no tutorial article or practice discussion any more; the first real article's discussion is the practice. Older students may still have a "Welcome" tutorial article, which keeps working.

**Replay:** user menu → "Welcome" (`?demo=true`) shows the three cards and returns home.

---

## Step 3: First three articles

`src/lib/starter-articles.ts`, run in the background (`after()`) when the profile is saved. `students.starter_articles_status` is `pending` until it finishes, then `done`.

For each of the student's first three interests:
1. If the shared cache has an unseen, unflagged article tagged with that topic at the student's level, serve it (instant).
2. Otherwise write one with the morning batch's steps (`writeInterestArticle` in `src/lib/batch/morning-batch.ts`): find a source, rewrite at level 4, tag, adapt to the student's level. Both versions go into the cache for other students.

Interests written in parallel; expect about a minute or two. Anything that fails is skipped. On the first visit the home page tops the feed up from the cache only if fewer than 3 articles are unread (5 afterwards).

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

Students who haven't completed onboarding see the interest chat when they log in. They cannot access the main app until onboarding is complete.

Some test students are intentionally left un-onboarded for testing the onboarding flow.

---

## Grace Period

After onboarding, the first **3 sessions** are a grace period — no level progression evaluation, no probing. The system gathers baseline data before making any adjustments. The student's initial reading level (L2 default) holds during this period.
