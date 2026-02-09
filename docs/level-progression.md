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

## Critical Consideration: AI-as-Assessor Uncertainty

Unlike Khan Academy (math is right or wrong) or IXL (objective answers), SigmaRead's comprehension scores are AI-generated judgments. The AI runs the conversation AND grades comprehension. There is no external validator.

A slightly different opening question, a different conversation style, or a student's phrasing being misinterpreted could swing a score by 10-15 points. This is inherent noise in our signal that objective-assessment products don't have.

**Implications:**
- Individual scores carry more uncertainty → need more evidence before acting
- Level changes should be validated by actual performance on harder/easier content, not just scores at the current level
- The scoring rubric must be extremely precise to minimize AI discretion

This leads directly to the Gradual Mix model below.

---

## Decision: Gradual Mix Level Progression

### Core Insight

Level changes should not be binary decisions. Instead of "you're at L3" → "now you're at L4," we gradually mix in content at adjacent levels and let the student's actual performance on that content be the proof. The student never knows they're being evaluated. Their feed just naturally adapts.

### How It Works

#### The Feed Mix

Every student has a **base level** (their official reading level) and a **feed mix** that determines what they actually see. The feed mix is expressed as a ratio of articles at different levels.

**Normal state (performing in instructional range):**
- 3/3 articles at base level

**Trending strong (potential level up):**
- Phase 1: 2 at base level + **1 at base+1** (probe article)
- Phase 2: 1 at base level + **2 at base+1**
- Phase 3: **3 at base+1** → base level officially moves up

**Struggling (potential level down — responds FASTER):**
- Immediate: 2 at base level + **1 at base-1** (confidence boost)
- If struggle continues: 1 at base level + **2 at base-1**
- If sustained: **3 at base-1** → base level officially moves down

#### Trigger Conditions

**Start mixing UP (introduce probe articles):**

| Tier | Trigger | Rationale |
|------|---------|-----------|
| **Younger (L1-L2)** | 4 of last 5 sessions score ≥ 85 | High bar because AI scores carry uncertainty. Must demonstrate clear, consistent mastery across multiple topics. |
| **Older (L3-L6)** | 3 of last 4 sessions score ≥ 90 | Higher threshold for older students — level jumps at L3+ represent bigger complexity increases. |

**Start mixing DOWN (introduce confidence boost articles):**

| Tier | Trigger | Rationale |
|------|---------|-----------|
| **Younger (L1-L2)** | 2 consecutive sessions score < 60 | Fast response. A struggling young reader needs a win quickly — don't wait for a pattern to become a spiral. This doesn't change their level; it just gives them something accessible. |
| **Older (L3-L6)** | 2 of last 3 sessions score < 55 | Slightly more evidence needed for older students, but still fast. |

#### Progression Through Mix Phases

**Upward progression:**
- **Phase 1 → Phase 2**: Student scores ≥ 80 on 2 of their first 3 probe articles at base+1
- **Phase 2 → Phase 3 (level change)**: Student scores ≥ 80 on 3 of their first 4 articles at base+1
- **Abort**: If student scores < 65 on 2 probe articles at base+1 at any phase, revert to 3/3 at base level. No penalty, no notification. Just quietly stop probing.

**Downward progression:**
- **Immediate mix**: 1 article at base-1 mixed into next feed. No waiting.
- **If base-1 articles score ≥ 75 AND base articles still < 60**: Increase mix to 2 at base-1
- **Level change**: If student consistently performs better at base-1 (3 of 4 sessions), officially move base level down
- **Recovery**: If student starts scoring ≥ 70 at base level again, quietly remove the base-1 articles. The struggle was temporary.

**Key asymmetry: Mixing down is NOT a demotion.** The student's base level doesn't change just because they got an easier article. Mixing down is a motivational tool — give the kid a win. Only sustained poor performance at base level combined with sustained success at base-1 triggers an actual level change.

### Additional Rules

1. **Cooldown after level change**: After base level officially changes (up or down), wait **3 sessions** of all-same-level content before any new mixing begins. Let the student settle.

2. **Maximum one level change at a time**: Never skip levels. Probe articles are always exactly one level above or below.

3. **L1 floor protection**: Students at L1 cannot go lower. If they have 3 of last 4 sessions below 50 at L1, trigger a guide alert: "[Name] may need additional reading support beyond SigmaRead." Continue serving L1 content.

4. **New student grace period**: First **3 sessions** after onboarding are calibration — no mixing, no level evaluation. Initial placement holds while we gather baseline data.

5. **Guide override**: Guides can manually set base level at any time. This resets the mix to 3/3 at the new level and restarts the evaluation window.

6. **Probe articles are not labeled**: Students never see "this is a harder article" or "this is an easier article." The feed looks the same regardless of mix. Category labels (News/Interest/Explore) stay; level information is never exposed to students.

7. **L6 ceiling**: Students at L6 cannot go higher. Sustained high scores at L6 trigger a guide notification: "[Name] is excelling at our highest level." This is a positive signal for the guide, not a problem to solve.

### Score Zones Reference

| Zone | Score Range | System Response |
|------|-------------|-----------------|
| **Excelling** | 85-100 | Consistent scores here trigger upward mix probing |
| **Instructional** | 65-84 | Optimally placed — no mixing, no changes |
| **Struggling** | 50-64 | Triggers downward mix (confidence boost articles) |
| **Frustration** | <50 | Immediate confidence boost + guide alert if sustained |

### Example Scenarios

**Emma (L2, age 8, strong reader):**
1. Sessions 1-5: Scores 82, 88, 91, 85, 90 → triggers upward mix
2. Session 6: Gets 2 L2 articles + 1 L3 probe article. Scores: L2=85, L2=80, L3=78
3. Session 7: Another probe. L2=88, L2=82, L3=83 → Phase 1 passing (2 of 3 probes ≥ 80)
4. Session 8: Phase 2. 1 L2 + 2 L3. Scores: L2=85, L3=80, L3=82
5. After a few more sessions of strong L3 performance → base level moves to L3

**Marcus (L1, age 9, reluctant reader):**
1. Sessions 1-3: Scores 68, 58, 52 → 2 consecutive below 60, triggers downward mix
2. But he's already at L1 — can't mix lower. Instead: guide alert + system serves easiest L1 articles (shortest, highest-interest topics)
3. Session 4: Scores 72 on a topic he likes. No level change needed — just needed the right article.

**Jayden (L3, age 11, inconsistent):**
1. Sessions 1-4: Scores 75, 82, 55, 78 → one bad session, but overall in instructional range. No action.
2. Sessions 5-7: Scores 52, 58, 61 → 2 of last 3 below 55, triggers downward mix
3. Session 8: 2 L3 + 1 L2 confidence boost. Scores: L3=60, L3=55, L2=82 (nails the easier one)
4. Session 9: L3=71, L3=68 → recovering at base level. Quietly remove L2 mix. The struggle was temporary.

### Comparison: Old vs New System

| | Old (Binary) | New (Gradual Mix) |
|---|---|---|
| Level up | Single score ≥ 85 → instant jump | Sustained high scores → probe articles at next level → prove performance → gradual transition |
| Level down | Single score < 55 → instant drop | 2 low scores → mix in easier article for a win → only change level if struggle is sustained AND easier content is clearly better |
| Student experience | Abrupt difficulty changes | Smooth, invisible transitions |
| False positives | High (one lucky/unlucky session) | Low (requires sustained evidence on actual harder/easier content) |
| Motivation | Risk of frustration spiral after premature promotion | Confidence boosts when struggling; challenge when ready |
| AI score uncertainty | Fully trusted | Mitigated — actual performance on different-level content validates scores |

### Confidence Assessment

**High confidence** in the gradual mix approach — this directly addresses the AI-as-assessor uncertainty problem by using actual performance on harder/easier content as validation rather than relying solely on AI-generated scores at the current level.

**High confidence** in the asymmetric response — every commercial product validates that responding faster to struggle than to success is correct. Our "give them a win" approach for struggling students is even better than a binary demotion.

**Moderate-high confidence** in specific thresholds — these should be validated with real usage data. After 30 days: (1) how often did probing trigger? (2) what % of probes led to actual level changes? (3) did confidence boost articles actually improve subsequent performance? Adjust based on findings.

### Implementation Notes

**Database changes needed:**
- Add `feed_mix` column to students (JSON: `{probeDirection: "up"|"down"|null, probePhase: 1|2|3, probeStartDate: date}`)
- Track which articles were served as probes vs base level (add `served_as_level` to articles table)

**Serve-cached route changes:**
- Check student's feed mix state when selecting articles
- If probing up: select N articles at base+1 level based on phase
- If probing down: select N articles at base-1 level based on phase
- Record served level on each article

**Post-conversation evaluation:**
- After each comprehension report, evaluate recent scores against trigger conditions
- Update feed mix state accordingly
- If phase transition conditions met, advance phase or revert

---

## Level Progression Optimization Plan

### Purpose

The specific thresholds in the Gradual Mix system (score targets, window sizes, probe validation criteria) are educated guesses based on competitive research. This plan ensures they are continuously validated and improved with real student data.

### What We Measure

**Per session:**
- Comprehension score (0-100), calibrated to reading level
- Self-assessment (4 options) + calibration flag (overconfident/underconfident)
- Conversation style used (1 of 6)
- Article metadata: level served, topic, category, base article ID
- Probe tracking: whether article was served at a different level (`served_as_level`)
- Feed mix state: probe direction, phase, scores on probes

**Derived over time:**
- Score trends per student (improving, flat, declining)
- Score distribution by reading level
- Topic effects on scores
- Conversation style effects on scores
- Probe success rates
- Time-to-stabilize for new students
- AI scoring variance (session-to-session fluctuation for stable students)

### Optimization Cadence

- **Weeks 1-4 after launch**: Baseline period. Collect data, no threshold changes.
- **Monthly thereafter**: Full optimization review on the 1st of each month.
- **Mid-cycle alerts**: If a metric goes critical (see below), flag in morning brief immediately rather than waiting for monthly review.

### Monthly Review Process

#### Step 1: Pull Metrics

Run the level progression analytics query (to be built into admin metrics page). Key numbers:

1. Total sessions completed across all students
2. Probe trigger rate — % of students who entered probing state
3. Probe success rate — % of probes that led to phase advancement vs abort
4. Level change rate — how many students actually changed levels
5. Post-change performance — scores in first 5 sessions after a level change
6. Score variance — standard deviation per student over rolling 5-session windows
7. Frustration indicators — sessions with score <50, especially consecutive
8. Self-assessment calibration — correlation between overconfidence flags and probe failures
9. Downward mix recovery rate — % of students who returned to base level without a level change
10. Reversal rate — students who leveled up then leveled back down within 2 weeks

#### Step 2: Diagnose Against Target Ranges

| Metric | Healthy Range | Too Low Means | Too High Means |
|--------|--------------|---------------|----------------|
| Probe trigger rate | 15-25% of students/month | Thresholds too strict, students stuck at levels | Thresholds too loose, system is restless |
| Probe → level change rate | 40-60% of triggered probes | Promoting into probes too early | Probes too easy, not testing real readiness |
| Post-change success rate | 70%+ score ≥65 in first 5 sessions | Level change was premature | Level change was overdue |
| Score variance per student | SD of 8-12 points | Conversations too formulaic | AI scoring inconsistent or content difficulty varies too much |
| Downward mix recovery rate | 50%+ return without level change | Students aren't recovering — base level is wrong | Struggles are temporary — confirms the design |
| Reversal rate | <10% | Healthy | Level changes are premature, tighten criteria |

#### Step 3: Adjust One Variable at a Time

**Critical rule: Never change multiple thresholds simultaneously.** Pick the biggest problem, adjust the single most relevant parameter, observe for 2-4 weeks.

Example adjustments:
- Probe trigger rate too low → lower score threshold by 5 points (e.g., 85→80 for younger)
- Post-change success rate too low → add more required probe sessions before committing
- Score variance too high → investigate conversation styles as confound, potentially normalize scores by style
- Reversal rate too high → extend probe phases, require more evidence

#### Step 4: Validate

**With enough students (20+):** A/B cohort testing. Split students, compare post-change success rates after 3 weeks.

**With small student counts:** Before/after comparison. Measure same metrics for 4 weeks pre-change vs 4 weeks post-change.

### Success Criteria

An optimization is **successful** when:
- The target metric moves into the healthy range
- Other metrics don't degrade (no whack-a-mole effects)
- Guide feedback doesn't surface new complaints
- Students who change levels perform well afterward

An optimization **failed** when:
- The target metric doesn't improve or gets worse
- A previously healthy metric degrades
- Guide alerts increase (more L1 floor alerts, more frustrated students)
- Reversal rate increases

**If a change fails: revert immediately.** The system stores feed_mix state, so reverting a threshold doesn't disrupt students mid-probe.

### Reporting

- **Admin metrics page**: Monthly summary — probe/change rates, post-change success, threshold adjustments made and why
- **Morning brief**: Flag anomalies mid-cycle if a metric goes critical
- **This document**: Updated with each threshold change — what was changed, why, what happened

### Change Log

| Date | Change | Rationale | Outcome |
|------|--------|-----------|---------|
| 2026-02-09 | Initial thresholds set | Based on competitive research synthesis | Baseline — awaiting real data |
