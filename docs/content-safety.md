# Content Safety

*Last updated: February 8, 2026*

SigmaRead filters inappropriate content at three layers. Filtering is **silent** — students never see a refusal or explanation. Inappropriate interests are simply omitted and the system moves on.

---

## Design Principle

**Silent filtering, no shaming.** A kid who types "I'm into nuclear war" doesn't get a lecture about appropriate interests. The system just doesn't generate articles about nuclear war. If all of a student's interests are inappropriate, the system defaults to animals, space, and sports — safe, universally engaging topics.

---

## Layer 1: Onboarding Interest Interview

When a student tells the AI their interests during onboarding, the AI prompt includes an explicit instruction to silently filter inappropriate interests before outputting the interest profile.

**Filtered categories:**
- Violence (war, weapons, murder)
- Sexual content
- Drugs and substance abuse
- Self-harm
- Politically polarizing topics (abortion, partisan politics)

**Behavior:** The AI omits filtered interests from the `[PROFILE]` JSON output. It does NOT mention the filtering to the student. If ALL interests are inappropriate, the profile defaults to `["animals", "space", "sports"]`.

**Location in code:** `src/lib/prompts.ts` → `INTEREST_INTERVIEW`

---

## Layer 2: Interest Suggestion Filter (Regex)

When a student suggests a new topic via the "I'm into something new" flow, the suggestion passes through a regex filter before being saved to the database.

**How it works:**
1. Check against an **allowlist** of legitimate topics that contain blocked substrings (e.g., "Star Wars", "nuclear energy", "civil war history", "drug discovery")
2. If not allowlisted, check against a **blocklist** regex pattern
3. If blocked, return success (HTTP 200) but don't save the suggestion — the student never knows it was filtered

**Allowlisted terms:** Star Wars, civil war, world war, cold war, drug discovery, drugstore, nuclear energy, nuclear power, nuclear physics, warfare history, revolutionary war

**Blocked patterns:** war, warfare, weapons, murder, killing, guns, bombing, nuclear war/bomb/weapon, abortion, drugs (except drugstore/discovery), suicide, sexual, porn, alcohol, tobacco, self-harm, terrorism, mass shooting, school shooting, genocide, rape

**Location in code:** `src/app/api/articles/feed-event/route.ts`

---

## Layer 3: Morning Batch Article Generation

The morning batch job that generates the day's articles includes an explicit instruction to Claude to never generate articles about:

- Violence, weapons, or warfare (except historical events framed educationally)
- Sexual content of any kind
- Drug use or substance abuse
- Self-harm or suicide
- Abortion
- Partisan political content

This is enforced in the topic planning prompt within the morning batch script.

**Location in code:** `scripts/morning-batch.ts` → topic planning prompt

---

## What Each Layer Catches

| Scenario | Layer 1 | Layer 2 | Layer 3 |
|----------|---------|---------|---------|
| Student says "I like guns" during onboarding | ✅ Filtered | — | — |
| Student suggests "teach me about murder" later | — | ✅ Filtered | — |
| Morning batch considers generating a war article | — | — | ✅ Filtered |
| Student says "I like Star Wars" | ✅ Passes (legitimate) | ✅ Passes (allowlisted) | ✅ Passes |
| Student says "nuclear energy" | ✅ Passes | ✅ Passes (allowlisted) | ✅ Passes |

---

## Edge Cases

**Historical war topics:** "Civil war history" and "World War 2" pass the regex filter and are handled by the AI layers, which can generate age-appropriate historical content. The morning batch prompt allows historical events framed educationally.

**Ambiguous terms:** The regex filter intentionally has some false negatives (lets ambiguous terms through) rather than false positives (blocks legitimate interests). When in doubt, let the AI layers handle nuance — they're better at it than regex.

**New edge cases:** When a new inappropriate pattern is discovered, add it to the relevant layer. Layer 2 (regex) is the fastest to update. Layer 1 and 3 (AI prompts) handle ambiguity better but require redeployment.

---

## Parent Communication

Per the [Content Policy](./content-policy.md), our selection criteria are documented and available to any parent who asks. We proactively communicate our approach rather than waiting for complaints. The content safety system is part of this transparency story — we can explain exactly how we filter without revealing the specific blocked terms to students.
