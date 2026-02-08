# Reading Level Progression Rules

## Research: How Commercial EdTech Products Handle Level Progression

### 1. Khan Academy — Mastery Levels
Khan Academy uses a 4-tier skill mastery system: **Attempted → Familiar → Proficient → Mastered**.

**Level up mechanics:**
- **Attempted → Familiar**: Score 70-85% on an exercise, OR answer correctly on a mixed-skill quiz
- **Familiar → Proficient**: Score 100% on an exercise, OR answer correctly on a mixed-skill assessment while at Familiar
- **Proficient → Mastered**: Answer correctly on a **Unit Test** while at Proficient — this is the key gate

**Level down mechanics:**
- Mastered → Proficient: Score 70-99% on an exercise
- Mastered → Familiar: Score **below 70%** on an exercise (drops TWO levels)
- Any level → lower: Miss questions on assessments

**Key design choice**: Khan requires **multiple contexts** to reach full mastery (exercise → quiz → unit test). A single exercise can get you to Proficient, but you need a unit test to reach Mastered. This ensures demonstrated skill transfer, not just familiarity with one problem set.

**Relevance to SigmaRead**: Khan's insight is that moving up should require demonstration in multiple contexts. For us, that maps to multiple articles across different topics — one great conversation about a topic the student already knows shouldn't trigger a level change.

### 2. IXL — SmartScore
IXL uses a continuous 0-100 "SmartScore" that adapts within a single practice session.

**Progression zones:**
- **0-69**: Learning zone — large gains for correct answers, small penalties for incorrect
- **70-79**: Approaching proficiency — balanced gains/penalties
- **80** = **Proficient** (the primary teacher-facing target)
- **80-89**: Above proficiency — smaller gains, larger penalties
- **90-100**: **Challenge Zone** — questions get harder, only 1-2 points per correct answer, 3-8 point penalties for mistakes. Must answer ~10 consecutive correctly to reach 100.
- **100** = **Mastered**

**Key design choice**: IXL makes the path from 80→100 deliberately hard. The questions get harder AND the scoring tightens. This prevents "coasting" — you can't mastery-farm by answering easy questions. Penalties escalate as you get higher, so a student can't stay at a level they don't genuinely belong at.

**Relevance to SigmaRead**: The asymmetric penalty structure is directly applicable. When a student is performing well, wrong answers should weigh more heavily than when they're still finding their footing. For us: once a student has leveled up, a poor score should carry more weight in the evaluation window than when they're establishing themselves at a level.

### 3. Newsela — Adaptive Article Levels
Newsela is the closest commercial product to SigmaRead (articles at multiple reading levels with comprehension quizzes).

**Level adjustment mechanics:**
- Default starting level: **grade level minus one** (or grade 5 if no grade set)
- Adaptive adjustment begins after **at least 1 quiz**, with confidence growing over more quizzes
- Earlier documentation references needing **8 completed quizzes** before the system has high confidence in its level recommendation
- Level is **continuously recalculated** based on weighted factors: prior quiz performance (heaviest weight), Check for Understanding activities, Guided Highlighting, grade level, and optional NWEA/MAP scores
- Teachers can override and lock student levels at any time

**Key design choice**: Newsela starts conservative (grade level minus one) and builds confidence gradually. It doesn't wait for 8 quizzes to make ANY adjustment — it starts adjusting after 1, but its confidence in the recommendation grows with more data. This is a Bayesian approach: strong prior (grade level), updated by evidence.

**Relevance to SigmaRead**: This is the strongest model for us. Start with a reasonable default, begin adjusting early but cautiously, increase confidence (and willingness to make bigger moves) as data accumulates. The "grade minus one" default is smart — slightly easy is better than slightly hard for first impressions.

### 4. Lexia Core5 — Placement and Advancement
Lexia Core5 (K-5 reading) uses an auto-placement assessment followed by continuous in-program advancement.

**Placement mechanics:**
- Students complete activities at a level
- If they demonstrate **≥90% accuracy** on **both** activities at a level, they advance to the next level
- If accuracy drops, they drop levels until placement is found
- Teachers can see if a student has "High Accuracy and Fast Rate" across all 5 activities, suggesting they might belong higher

**Advancement during regular use:**
- Students advance through units by demonstrating mastery
- If they struggle, the system branches to additional instruction before allowing progression
- 3-step branching: initial instruction → targeted practice on errors → reassessment

**Key design choice**: Lexia requires proficiency on **two different activities** at the same level — not just one. This guards against topic-specific flukes. The 90% threshold is high, ensuring clear mastery before advancement.

**Relevance to SigmaRead**: The "two different activities" requirement maps well to our context — we should require strong performance across multiple articles/topics, not just one subject the student happens to know well.

### 5. Math Academy — Knowledge Graph and Spaced Repetition
Math Academy's approach is fundamentally different (topic-by-topic mastery, not a single "level"), but their principles are highly relevant.

**Mastery mechanics:**
- Each topic requires demonstrated mastery before unlocking dependent topics
- Mastery is tracked through spaced repetition — a student's "knowledge" of a topic decays over time
- If a student goes too long without review, their mastery degrades
- The diagnostic algorithm finds the student's "knowledge frontier" — the boundary between what they know and don't know
- **Student ability is estimated from accuracy on prerequisites and updated with each answer**

**Key design choices:**
- Mastery is not binary — it's a continuous measure that decays
- The system estimates **student learning speed** as ratio of student ability to topic difficulty
- Answers on advanced topics give partial credit to prerequisite topics ("implicit repetition"), but discounted based on timing
- Failed reviews on prerequisites penalize dependent topics too

**Relevance to SigmaRead**: Math Academy's core insight is that mastery should be based on accumulated evidence over time, not single-point measurements. Their spaced repetition approach means a topic isn't "done" after one success — the student must demonstrate retained understanding. For us: even after a student levels up, their continued performance should validate that decision. If they start struggling at the new level, the system should respond quickly.

### 6. Achieve3000 — LevelSet
Achieve3000 (closest to SigmaRead in product design — adaptive news articles with comprehension activities).

**Level mechanics:**
- Formal diagnostic (LevelSet) administered **3 times per year** (beginning, middle, end)
- Between diagnostics, Lexile is adjusted monthly based on completed activities
- Only activities completed during **official school hours** count toward adjustment
- Teachers can manually adjust within 3 weeks of the last LevelSet
- 12 difficulty levels available

**Key design choice**: Achieve3000 uses a **dual system**: formal diagnostics for major placement, embedded assessment for fine-tuning. The monthly adjustment cadence (not per-session) means they're looking at trends, not individual data points.

**Relevance to SigmaRead**: The monthly cadence isn't right for us (our students do 3 articles/day, so we'd have 60-90 data points per month). But the principle of periodic evaluation windows rather than per-session reactions is sound.

### 7. Duolingo — Birdbrain
Duolingo's Birdbrain model uses machine learning to predict exercise difficulty for each learner.

**Key mechanics:**
- Continuous estimation of both **learner ability** and **exercise difficulty**
- When a learner gets an exercise wrong, Birdbrain lowers the estimate of user ability AND raises the estimate of exercise difficulty
- Exercise difficulty is adjusted **on the fly within a session**
- Goal: keep exercises at ~80% success rate (the "desirable difficulty" zone)
- Result: 14% improvement in learning outcomes in A/B tests

**Key design choice**: Duolingo targets an **80% success rate** — not 100%, not 60%. This aligns with research on "desirable difficulty" — challenging enough to promote learning, achievable enough to maintain motivation.

**Relevance to SigmaRead**: The 80% target maps to a score of ~80 in our system. Students scoring 75-85 consistently are ideally placed. This validates our intuition that 85+ means "ready for harder" rather than 70+ (which would be too aggressive).

---

## Synthesis: What the Best Products Have in Common

1. **No single-session level changes**: Every product requires accumulated evidence. Khan needs exercises + quizzes + unit tests. IXL needs ~10 consecutive correct at the hard end. Newsela builds confidence over multiple quizzes. Lexia requires 90%+ on two different activities.

2. **Conservative starting position**: Newsela starts at grade minus one. Lexia starts with a placement assessment. Achieve3000 uses a formal diagnostic. Nobody throws students into the deep end.

3. **Asymmetric response**: Going up is harder than going down. IXL's penalty structure escalates at higher scores. Khan drops you two levels if you score below 70% at Mastered. The cost of being placed too high (frustration/disengagement) is universally recognized as worse than too low.

4. **Multiple contexts required**: Khan requires success across exercises AND assessments. Lexia requires two different activities. This prevents topic-specific flukes from causing level changes.

5. **~80% as the sweet spot**: Duolingo targets 80% success. IXL defines 80 as "proficient." The Lexile Framework targets 75% comprehension. Everybody converges on the same zone.

6. **Teacher/guide override always available**: Every product lets educators override the algorithm. The human in the loop is a safety valve.

---

## Decision: SigmaRead Level Progression Rules

### Design Principles (informed by commercial product research)
1. **Multiple articles, not one** — require evidence across different topics (Khan, Lexia pattern)
2. **Asymmetric response** — harder to go up than down (IXL, Khan pattern)
3. **~80 is "correctly placed"** — don't chase 100 (Duolingo, Lexile, IXL pattern)
4. **Conservative start, build confidence** — trust the data more as it accumulates (Newsela pattern)
5. **Age-appropriate windows** — younger readers need more data points (K-12 adaptive learning research)
6. **Guide override** — algorithm is a recommendation, not a prison (universal pattern)

### Tier Definitions

| Tier | Levels | Grades | Description |
|------|--------|--------|-------------|
| **Younger** | L1-L2 | 2-4 | Foundational readers. High performance variability. Need stability. |
| **Older** | L3-L6 | 5-8 | Developing/proficient readers. More stable, reliable signals. |

### Level Up Rules

| Tier | Criteria | Rationale |
|------|----------|-----------|
| **Younger (L1-L2)** | 4 of last 5 sessions score ≥ 80 | Aligns with IXL's proficiency threshold of 80, requires evidence across multiple articles (like Lexia's two-activity requirement), and the 4/5 window accounts for younger readers' higher variability. Achievable in ~2 weeks of regular use. |
| **Older (L3-L6)** | 3 of last 4 sessions score ≥ 85 | Higher threshold because level jumps at L3+ represent bigger complexity increases. 3/4 window is responsive but requires consistency across multiple topics. Achievable in ~1 week. |

### Level Down Rules

| Tier | Criteria | Rationale |
|------|----------|-----------|
| **Younger (L1-L2)** | 3 of last 4 sessions score < 60 | Faster than level-up (asymmetric, like IXL/Khan). 60 threshold is below instructional range — a pattern here means genuine misplacement. |
| **Older (L3-L6)** | 3 of last 5 sessions score < 55 | Lower threshold and slightly larger window. Older students with stable skills shouldn't be scoring this low consistently unless misplaced. |

### Additional Rules

1. **Cooldown period**: After any level change, wait **3 sessions** before evaluating again. Mirrors how Achieve3000 gates changes behind time windows. Prevents ping-ponging and gives students time to calibrate to new difficulty.

2. **Maximum one level change at a time**: Never skip levels. Khan's two-level drop on a bad score at Mastered is aggressive — we're gentler because our levels represent broader ranges.

3. **L1 floor protection**: Students at L1 cannot level down. If they have 3 of last 4 sessions below 50, trigger a guide alert: "[Name] may need additional reading support beyond SigmaRead." This mirrors how Lexia branches to additional instruction rather than abandoning the student.

4. **New student grace period**: First **3 sessions** after onboarding are calibration — no level changes. Aligns with Newsela's approach of starting conservative and building confidence. Initial placement (default L2, or set by guide) holds while we gather baseline data.

5. **Guide override**: Guides can manually adjust levels at any time. Manual adjustments reset the evaluation window. Every product we studied provides this — the algorithm is a recommendation, not a prison.

6. **Session weighting**: All sessions within the evaluation window weighted equally. Math Academy uses sophisticated decay functions, but they have hundreds of micro-assessments per topic. With 3 sessions/day, equal weighting is appropriate for our data density.

### Score Zones Reference

| Zone | Score Range | Interpretation | Action |
|------|-------------|----------------|--------|
| **Excelling** | 85-100 | Consistently above instructional range | Evaluate for level up |
| **Instructional** | 65-84 | Optimally placed (aligns with Duolingo's 80% target, Lexile's 75% match) | Stay |
| **Approaching** | 50-64 | Below instructional range | Watch for pattern |
| **Frustration** | <50 | Well below instructional range | Evaluate for level down + guide alert |

### Comparison: Old vs New Rules

| | Old | New |
|---|---|---|
| Level up | Single score ≥ 85 | 3-4 of last 4-5 scores ≥ 80-85 (tier-dependent) |
| Level down | Single score < 55 | 3 of last 4-5 scores < 55-60 (tier-dependent) |
| Cooldown | None | 3 sessions after any change |
| Grace period | None | First 3 sessions |
| Age differentiation | None | Younger vs older tiers |
| Guide override | Not implemented | Available, resets window |

### Expected Impact
- **Fewer false upgrades**: Students like Aisha won't jump from L3→L4 on a single 95. She'll need to sustain ~85+ across 3-4 sessions across different articles and topics.
- **Faster frustration detection**: Students like Marcus who consistently score <60 will be flagged, but a single rough session (bad day, unfamiliar topic) won't trigger a downgrade.
- **More stable trajectories**: Level changes will be meaningful signals for guides, not noise. When a level change happens, it means something.
- **Age-appropriate sensitivity**: A 2nd grader who scores 85 once might have just known a lot about dogs. A 7th grader who scores 85 three times across different topics is genuinely ready for harder text.

### Confidence Assessment
**High confidence** in the framework and principles — every commercial product we reviewed validates the core design choices (multiple observations, asymmetric response, ~80% target, conservative start).

**Moderate-high confidence** in the specific numbers — our thresholds are calibrated to the convergence point across products (IXL's 80, Duolingo's 80%, Lexile's 75%), and our window sizes align with established patterns (Lexia's 2-activity requirement, Newsela's multi-quiz confidence building). The exact numbers (4/5 vs 3/4, 80 vs 85) are informed judgment that we should validate with real usage data over the first 1-2 months.

**Plan to validate**: After 30 days of real student usage, analyze: (1) how many level changes occurred, (2) whether students performed appropriately after level changes, (3) whether any students appeared "stuck" at wrong levels. Adjust thresholds based on findings.
