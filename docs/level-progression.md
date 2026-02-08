# Reading Level Progression Rules

## Research Foundation

### Key Principles from Learning Science

**1. The Lexile Framework's 75% Comprehension Target**
MetaMetrics research establishes that when a reader and text are appropriately matched, the reader achieves ~75% comprehension. This is the "sweet spot" — challenging enough to grow, accessible enough to succeed. In SigmaRead terms, a student consistently scoring 70-80 is *correctly placed* — not struggling.

**2. Betts' Reading Levels (updated by Shanahan)**
Traditional reading science defines three zones:
- **Independent level**: 90%+ comprehension — too easy, limited growth
- **Instructional level**: 60-89% comprehension — optimal learning zone (with support)
- **Frustration level**: <60% comprehension — too hard, disengagement risk

Shanahan's more recent work suggests the instructional sweet spot is actually broader than Betts claimed, and that students learn effectively from more challenging text than traditionally assumed — especially with scaffolding (which our AI discussion provides).

**3. Zone of Proximal Development (Vygotsky)**
Optimal learning occurs in the space between what a student can do independently and what they can achieve with guidance. SigmaRead's AI discussion *is* the scaffolding — students discuss the article with support. This means we can target slightly harder text than a pure independent-reading system would.

**4. Younger vs. Older Students Have Different Stability**
Research consistently shows younger students' reading performance is more variable:
- Younger readers (grades 2-4) are still developing foundational skills. Performance fluctuates based on topic familiarity, mood, time of day, fatigue.
- Older readers (grades 5-8) have more stable decoding skills. Comprehension variation is more likely to reflect genuine ability differences.
- Adaptive systems that use younger students' data need more observations before making confident decisions (the "guesswork" problem noted in K-12 adaptive learning research).

**5. Achieve3000's Approach**
Achieve3000 (the closest commercial analog to SigmaRead) uses a formal LevelSet assessment administered 3 times/year, with ongoing embedded assessments adjusting Lexile between formal assessments. They explicitly gate level changes behind accumulated evidence, not single-session performance.

**6. The Cost of Wrong Placement**
- **Placed too high**: Frustration → disengagement → avoidance. For reluctant readers (our Marcus archetype), this is catastrophic. Recovery is harder than prevention.
- **Placed too low**: Boredom → disengagement, but less damaging. A strong reader given slightly easy text still learns (just less efficiently). And they demonstrate mastery quickly, triggering an upgrade.

This asymmetry means **we should be more cautious about leveling up than about staying put, and faster about leveling down than about leveling up.**

---

## Decision: SigmaRead Level Progression Rules

### Design Principles
1. **Require evidence, not luck** — no single session should change a student's level
2. **Asymmetric caution** — leveling down should be faster than leveling up (wrong-high is worse than wrong-low)
3. **Age-appropriate windows** — younger students need more data points before changes
4. **SigmaRead's AI discussion is scaffolding** — our comprehension scores reflect supported performance, which should be higher than independent reading

### Tier Definitions

| Tier | Levels | Grades | Description |
|------|--------|--------|-------------|
| **Younger** | L1-L2 | 2-4 | Foundational readers. High variability. Need stability. |
| **Older** | L3-L6 | 5-8 | Developing/proficient readers. More stable signals. |

### Level Up Rules

| Tier | Criteria | Rationale |
|------|----------|-----------|
| **Younger (L1-L2)** | 4 of last 5 sessions score ≥ 80 | Young readers need more evidence. Topic familiarity causes score spikes. 4/5 filters out lucky days while still being responsive (achievable in ~1 week of regular use). |
| **Older (L3-L6)** | 3 of last 4 sessions score ≥ 85 | Older readers' scores are more stable. Higher threshold (85 vs 80) because these levels represent bigger complexity jumps. 3/4 is responsive but requires consistency. |

### Level Down Rules

| Tier | Criteria | Rationale |
|------|----------|-----------|
| **Younger (L1-L2)** | 3 of last 4 sessions score < 60 | Faster response to prevent frustration spiral. But still requires pattern, not a single bad day. L1 students can't go lower — trigger guide alert instead. |
| **Older (L3-L6)** | 3 of last 5 sessions score < 55 | Lower threshold because older students should demonstrate comprehension more consistently. Slightly larger window because older students' bad days are less frequent. |

### Additional Rules

1. **Cooldown period**: After any level change, wait 3 sessions before evaluating again. This prevents ping-ponging and gives the student time to adjust to new difficulty.

2. **Maximum one level change at a time**: Never skip levels, even if scores are dramatically high/low. Gradual transitions are more stable.

3. **L1 floor protection**: Students at L1 cannot level down. Instead, 3 consecutive sessions below 50 trigger a guide alert: "Marcus may need additional reading support beyond SigmaRead."

4. **New student grace period**: First 3 sessions after onboarding are "calibration" — no level changes. Initial placement (default L2, or set by guide) holds while we gather baseline data.

5. **Guide override**: Guides can manually adjust levels at any time. Manual adjustments reset the evaluation window.

6. **Score weighting**: All sessions weighted equally. We considered recency weighting but it adds complexity without clear research support for reading comprehension (unlike skill-based systems like Math Academy where recent performance better predicts current ability).

### Score Zones Reference

| Zone | Score Range | Meaning |
|------|-------------|---------|
| **Mastery** | 85-100 | Student is excelling at this level — may be ready for more challenge |
| **Instructional** | 65-84 | Student is appropriately placed — learning is happening |
| **Approaching** | 50-64 | Student is struggling — watch for pattern |
| **Frustration** | <50 | Student is overwhelmed — likely needs to level down |

### Comparison: Old vs New Rules

| | Old | New |
|---|---|---|
| Level up | Single score ≥ 85 | 3-4 of last 4-5 scores ≥ 80-85 (tier-dependent) |
| Level down | Single score < 55 | 3 of last 4-5 scores < 55-60 (tier-dependent) |
| Cooldown | None | 3 sessions after any change |
| Grace period | None | First 3 sessions |
| Age differentiation | None | Younger vs older tiers |

### Expected Impact
- **Fewer false upgrades**: Students like Aisha won't jump from L3→L4 on a single 95. She'll need to sustain ~85+ across 3-4 sessions.
- **Faster frustration detection**: Students like Marcus who consistently score <60 will get flagged, but a single rough session won't trigger a downgrade.
- **More stable trajectories**: Level changes will be meaningful signals for guides, not noise.
- **Age-appropriate sensitivity**: A 2nd grader who scores 85 once might have just known a lot about dogs. A 7th grader who scores 85 three times is genuinely ready for harder text.
