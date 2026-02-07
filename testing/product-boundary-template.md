# SigmaRead — Product Boundary Document

**Version:** 1.0
**Last updated:** February 7, 2026
**Source:** Wayne Vaughan founder interview

---

## SigmaRead IS:
- A beautifully designed app that helps young readers improve their reading comprehension
- Designed for the way students learn, not the way classrooms operate
- Fun and easy — one of the more relaxing parts of a student's day
- Personalized to the individual student — interests, reading level, pace
- An AI-first application where conversations feel like talking to a human guide
- Part of the broader Sigma/Compass ecosystem (earns XP, feeds into MAP testing)

## SigmaRead IS NOT:
- A political indoctrination tool — content must be neutral, factual, age-appropriate
- Boring or frustrating — if a student dreads opening it, we've failed
- Full of hallucinated facts and misinformation — content accuracy is non-negotiable
- A tool for schools wanting tight editorial control over student reading
- A same-pace classroom tool — everything is individualized
- A quiz app — no multiple choice, no fill-in-the-blank
- A gamification platform — XP is a Compass-wide progress system, not badges/streaks in SigmaRead

## The One Thing
If SigmaRead does one thing perfectly: **a student reads an article matched to their interests and level, has a brief conversation that genuinely assesses their comprehension, and the guide gets honest signal about what the student understood.**

## The Core Loop
```
Student sees 5 articles → Picks one → Reads it → Reacts (like/dislike) →
Brief conversation with AI (3-4 turns) → Self-assessment → Next article
```

**Critical properties of the loop:**
- Each step flows automatically to the next (no extra buttons or decisions)
- Students should have one path forward at all times
- The conversation should feel like talking to a guide, not taking a test
- Structure is consistent enough that students know what to expect, varied enough it doesn't feel robotic

## The Ideal Session
5 articles available. 3 required per day. Student reads, reacts, discusses, repeats. Takes 2-5 minutes per article (including discussion). Student feels good about the experience. The AI occasionally asks about adding new interests. When done, the student is done.

## What Breaks the Experience
- Boring articles disconnected from interests
- Articles too hard or too easy for reading level
- Factual errors or hallucinated content
- Same conversation structure every time (robotic)
- Inauthentic AI voice
- Political or ideological bias in content
- It feeling like a chore

## Target Users

### Students
- Grades 4-8 (age ~10-14)
- Sigma School students (initial), homeschool students (expansion)
- All reading levels and motivation levels
- Need: content they actually want to read + a low-friction assessment experience

### Guides (parents, teachers, tutors)
- Need: at-a-glance signal on who's succeeding and who's struggling
- Need: honest comprehension data, not inflated metrics
- Some influence over content direction, not full editorial control
- Check-in patterns vary: daily (Calie) to weekly (Tom) to sporadic (David)

### NOT for:
- Schools wanting same-pace, whole-class instruction
- Schools wanting full editorial control over reading material
- Standardized test prep (SigmaRead improves comprehension, but isn't a test prep tool)

## Success Metrics
| Metric | How Measured |
|--------|-------------|
| Reading comprehension growth | MAP tests 3x/year |
| Lexile level progression | Built-in tracking over time |
| Comprehension score trends | Per-student rolling averages |
| Zone of proximal development fit | Score distribution centered 60-75 |
| Student engagement | Sessions completed, time in app |
| Guide utility | Do guides find the dashboard useful? |

## The 30-Day Fence
Features we explicitly will NOT build in the next 30 days:

1. Anything that overcomplicates the student experience
2. Features for the sake of features — everything ties to core values
3. Full gamification systems (XP is Compass-wide, not SigmaRead-specific)
4. SSO / public signup / payment
5. Native mobile apps
6. Subject expansion beyond reading comprehension
7. Full editorial control tools for guides

## Quality Bar
Every improvement must pass these filters:

1. **Core loop check:** Does this strengthen read → react → discuss → assess?
2. **One path forward:** Does this keep the student focused or add options/complexity?
3. **Guide signal:** Does this help guides identify who needs attention?
4. **Content integrity:** Does this protect against hallucination, bias, or inappropriate content?
5. **Joy check:** Would Max enjoy this, or would it make SigmaRead feel like a chore?

If any answer is wrong, the improvement needs explicit founder approval.

## Competitive Moat
"SigmaRead gets to know your kid. No multiple choice. Kids discuss articles with an AI that genuinely assesses comprehension. They can look up any word and hear its pronunciation. We have a track record of improved MAP scores."

vs. Khan Academy: "Great tool, but not personalized to your kid's interests."
vs. ChatGPT: "Not designed for kids, no guide dashboard, no progress tracking."
vs. Reading Eggs: "Gamified to the point of distraction. We focus on actual comprehension."

## Design Principles
- Clean, minimal, calm — Apple Notes, not Duolingo
- Students have one path forward
- Scores are for guides, not students
- Content accuracy is non-negotiable
- The AI should feel like a human guide, not a chatbot
- Designed for the way students learn, not the way classrooms operate

## Core Values & Principles
*To be refined through ongoing development. Initial draft:*

1. **Personalization over standardization** — every student's experience is unique
2. **Comprehension over completion** — understanding matters more than finishing
3. **Simplicity over features** — one path forward, minimal cognitive load
4. **Honesty over encouragement** — real signal for guides, not inflated metrics
5. **Joy over obligation** — reading should feel like a pleasant part of the day
6. **Accuracy over speed** — no hallucinated facts, ever
