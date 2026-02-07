# Feedback Evaluation Filter

Every piece of feedback — whether from Wayne, simulated testers, or real users — runs through this filter before action.

---

## Gate 1: Scope Check
> Does this strengthen the core loop? (Read → Discuss → Assess → Report)

- **YES** → Proceed to Gate 2
- **NO** → Log it. Don't build it. Revisit only if Wayne explicitly prioritizes it.

## Gate 2: User Check
> Who benefits? Guide, student, or both?

- **Guide** → Does it help them understand student progress or take action?
- **Student** → Does it help them read more, engage deeper, or feel motivated?
- **Neither / "nice to have"** → Deprioritize.

## Gate 3: Impact Check
> How many users would this affect?

- **All users every session** → P0-P1, build immediately
- **Most users occasionally** → P1-P2, build soon
- **Some users rarely** → P2-P3, batch with other polish work
- **Edge case** → Log, don't build

## Gate 4: Simplicity Check
> Does this make the app simpler or more complex?

- **Simpler** → Strong signal to build
- **Same complexity** → Fine if it passes other gates
- **More complex** → Needs exceptional justification. Ask Wayne.

## Gate 5: Evidence Check
> Is this based on observed behavior or imagined behavior?

- **Observed** (real test, real friction) → High confidence
- **Inferred** (persona would likely struggle here) → Medium confidence
- **Speculative** (someone might want this) → Low confidence, don't build without validation

---

## Anti-Patterns (Feedback to Ignore)

1. **"What if we added..."** — Feature requests that expand scope without solving a real problem
2. **"Competitor X has..."** — Copying features without understanding if they serve our users
3. **"It would be cool if..."** — Novelty over utility
4. **"My friend/kid would want..."** — Anecdotal single-user feedback driving product changes
5. **"The AI should be more..."** — Personality/tone preferences that don't affect comprehension assessment
6. **"Make it more like [social media app]"** — Engagement tactics that undermine learning focus

---

## Priority Definitions

- **P0 — Blocking:** Users literally cannot complete the core loop. Fix immediately.
- **P1 — Painful:** Users can complete it but something hurts. Fix this week.
- **P2 — Annoying:** Friction that degrades experience but doesn't block. Fix this sprint.
- **P3 — Polish:** Nice-to-have improvements. Batch and do when convenient.
