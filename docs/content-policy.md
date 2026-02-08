# SigmaRead Content Selection Policy

*Last updated: February 8, 2026*

This document governs how articles are selected, generated, and delivered to students in SigmaRead. It is the authoritative reference for content decisions. If the technical implementation ever conflicts with this policy, the policy wins.

---

## Our Position

**We teach kids to read critically, not what to think.**

SigmaRead helps students become stronger readers through short, engaging articles matched to their interests and reading level, followed by guided discussions. Our article selection is guided by curiosity, factual accuracy, and age-appropriateness — not by any political, ideological, or commercial agenda.

---

## Selection Principles

### 1. Curiosity Over Coverage

We are not a newspaper. We do not attempt to "cover" everything happening in the world. We select stories that make a student want to read the next paragraph. If a story is important but boring to a 10-year-old, we skip it. There are better sources for comprehensive news coverage — our job is to build readers.

### 2. Interests Are the Anchor, Not the Cage

Approximately 60% of articles connect to what a student has told us they care about. The remaining 40% introduce new domains and topics designed to broaden their world. A student who said "basketball" should also encounter octopus biology and medieval castles. That's how interests grow.

### 3. Facts, Not Opinions

Every article reports what happened, not what should have happened. We never editorialize. For topics where multiple perspectives exist, we acknowledge them neutrally or frame them as questions for the student to consider. "Countries are debating how to handle AI in schools — what do you think?" is appropriate. "The government's misguided policy on AI..." is not.

### 4. Inform, Don't Alarm

Articles should spark curiosity, not anxiety. Content about natural disasters, wars, or crises is included only when it is (a) age-appropriate, (b) factually significant, and (c) framed in a way that helps students understand the world rather than fear it.

### 5. Variety by Design

We actively track which topic domains each student reads across the week and balance their feed accordingly. A student who has read four science articles and zero history articles will see history prioritized. This prevents topical echo chambers regardless of interest profiles.

---

## Content Framework: Three Buckets

### Bucket 1: Universally Safe (80%+ of content)

Science, animals, sports, space, technology, weather, human interest, gaming, arts, history, nature, engineering.

These are the core of SigmaRead. They are what kids actually want to read, and virtually no parent objects to them. The daily reading experience is built primarily from this bucket.

### Bucket 2: Civic Literacy (10-15% of content)

Factual world and civic events presented with neutral framing. Examples: election results, new laws, economic changes, international agreements, significant government actions.

A Bucket 2 story appears only when ALL of these criteria are met:
- **Factually significant** — not just politically noisy
- **Directly relevant** to a student's life or natural curiosity
- **Framed as a question**, not a conclusion
- **Reports the what**, not the why

Bucket 2 stories are always accompanied by multiple Bucket 1 options in the same day's feed. A civic article is never the only choice a student sees.

### Bucket 3: Polarizing (0% — excluded)

Topics where the selection itself signals a political stance. Stories that are primarily about partisan conflict, culture war issues, or ideological debates. These are excluded regardless of their newsworthiness.

The test: if consistently surfacing stories on this topic would cause a reasonable parent to suspect political bias — even if each individual article is factually accurate — the topic belongs in Bucket 3.

---

## Editorial Standards

### Factual Accuracy

Articles are AI-generated based on real news sources and verified headlines. Every article must be grounded in real, current information. The generation prompts explicitly prohibit fabrication of facts, statistics, or quotes.

**Current limitations:** AI-generated content may occasionally contain factual errors. We are building toward a review process (see Quality Assurance below).

### Source Attribution

Every article includes source attribution — the publication or URL that the article is based on. Sources must be established news organizations, scientific publications, or official institutional sources (NASA, universities, etc.).

Unacceptable sources: social media posts, opinion blogs, partisan media outlets, anonymous claims.

### Age Appropriateness

All content is calibrated to the student's grade level, not just in reading complexity but in subject matter. A factually appropriate story for a 14-year-old may not be appropriate for an 8-year-old, even at a simplified reading level.

### Editorial Neutrality in Discussions

The AI guide that discusses articles with students follows the same neutrality principles. The guide asks questions, explores the student's thinking, and helps them engage with the text. It never expresses political opinions, advocates for positions, or corrects a student's values.

---

## Prohibited Content

The following content categories are never generated or served, regardless of context:

- Graphic violence or detailed descriptions of violent acts
- Sexual content of any kind
- Self-harm, suicide methods, or eating disorder promotion
- Content that demeans or targets specific racial, ethnic, religious, or gender groups
- Detailed instructions for dangerous activities
- Content designed to frighten or traumatize
- Advertising or commercial promotion
- Conspiracy theories presented as fact
- Content that encourages illegal activity

---

## Quality Assurance

### Current Process (MVP)

1. Generation prompts include explicit factual accuracy requirements
2. Articles are generated using the best available AI model (currently Claude Opus 4.6)
3. Source attribution is required for all articles
4. Content bucket ratios are enforced in the generation prompt

### Planned Enhancements

1. **Guide review option** — Guides can flag articles as inaccurate or inappropriate, removing them from all student feeds
2. **Automated fact-checking** — Cross-reference key claims against reliable sources
3. **Reading level verification** — Automated Lexile scoring to confirm adapted articles match target levels
4. **Student feedback integration** — Low-rated articles are flagged for review

---

## Incident Response

### If a Parent Raises a Concern

1. **Acknowledge immediately.** Thank them for bringing it to our attention.
2. **Review the specific article.** Was it factually accurate? Was it age-appropriate? Which bucket does it fall into? Did it follow our editorial standards?
3. **Explain the selection reasoning.** The answer should always be one of: "because your child expressed interest in [topic]" or "because it's a significant real-world event that teaches critical reading skills."
4. **Take action if warranted.** If the article violated our policy, remove it and adjust the generation prompts. If it didn't, explain why it was included and offer to adjust the student's interest profile if the parent prefers.
5. **Document the incident.** Record the concern, the article, the resolution, and any prompt adjustments made.

### If an Article Contains Factual Errors

1. Remove the article from all student feeds immediately
2. If any student discussed the article, note the error in their session record
3. Review and adjust the generation prompt that produced it
4. Document the error type to prevent recurrence

---

## Parent Communication

### Proactive Transparency

- **Selection criteria are documented** (this document) and available to any parent who asks
- **Quarterly content summary** (planned) — a report showing article topic distribution, reading level coverage, and content bucket ratios for the term
- **Interest profile visibility** — parents/guides can see what interests drive their student's article selection

### The Principle

Parents who feel informed in advance are far less likely to feel ambushed. Our communication is proactive, not reactive. We don't wait for complaints to explain our approach — we share it upfront.

---

## The "Why Did We Pick This?" Test

Every article in SigmaRead must pass this test:

> If a parent asks why their child read this article, can we answer with either:
> 1. "Because your child is interested in [topic]"
> 2. "Because it's a factually significant event that teaches critical reading"
>
> If neither answer works, cut the article.

This is the final filter. It applies regardless of bucket, topic, or timeliness.

---

## Review Schedule

This policy is reviewed and updated:
- Quarterly, as part of the content summary process
- Whenever a significant incident occurs
- Whenever the article generation system is materially changed
