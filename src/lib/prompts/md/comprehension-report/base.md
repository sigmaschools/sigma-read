Generate a comprehension report for a guide based on a student's conversation about an article.

Article:
---
{{articleText}}
---

Transcript:
---
{{transcript}}
---

Student reading level: {{level}}

CRITICAL — CALIBRATE TO THE STUDENT'S LEVEL:
{{levelExpectations}}

Scoring (1-100) — calibrated to the expectations above, NOT to adult comprehension:
- 85-100: Exceptional for their level — demonstrates understanding beyond what's typical for this grade
- 70-84: Strong for their level — meets grade-level expectations with good detail
- 55-69: Solid for their level — grasps the core ideas and engages meaningfully
- 40-54: Developing — below grade-level expectations, surface-level engagement only
- Below 40: Struggled — could not articulate what the article was about

A Level 1 student who says "it was about a penguin that was pink and scientists were surprised" should score 75-85. That's a strong, concrete retelling for a Grade 2-3 student. Do NOT penalize young students for lacking inferential or analytical skills they haven't developed yet.

CRITICAL — ASSESS THE CONVERSATION, NOT THE ARTICLE:
You are evaluating how well the student demonstrated comprehension through the discussion they actually had — NOT auditing whether they mentioned every fact in the article. If the conversation never asked about a specific detail, do not penalize the student for not mentioning it. The questions asked shape what the student had the opportunity to demonstrate. Judge only what they were given a fair chance to show.

A student who engaged thoughtfully with the questions they were asked — even if those questions only covered part of the article — demonstrated comprehension. Coverage is a property of the conversation, not the student.

SKILLS — rate each one from what the conversation gave the student a chance to show:
- main_idea: can say what the article is mostly about
- key_details: recalls specific facts or events that matter
- vocabulary: understands or uses the article's topic words in context
- inference: explains why or how something happens beyond what is stated
- connection: links the article to their own life, other knowledge, or the wider world

For each: "shown", "partly", "not_shown", or "not_tested". Use "not_tested" when the conversation never gave them a fair chance to show it. That is a property of the conversation, not the student, and it must not lower the score.

EVIDENCE — 1 to 3 short quotes of the student's own words from the transcript, each tagged with the skill it relates to and whether it shows that skill (shows: true) or shows it missing (shows: false). Quote exactly; never paraphrase or invent.

Output fields:
- score: 1-100, calibrated as above
- rating: Exceptional (85-100), Strong (70-84), Solid (55-69), Developing (40-54), or Struggled (below 40)
- comprehension: 2-3 sentences on how well the student demonstrated understanding of the article's main ideas, based on what came up in the conversation
- depth: 2-3 sentences on the quality of their thinking. Did they explain in their own words, make connections, go beyond surface recall? "I think scientists were surprised because they didn't expect life there" shows more depth than restating a fact.
- engagement: 1-2 sentences on participation quality and effort
- skills: the five ratings above
- evidence: the quotes above
- summary: two plain sentences for the guide, the first giving the overall picture
- nextStep: one concrete thing the guide could try with this student next, e.g. "Ask them to explain why before what."

No softening. The guide needs honest signal — but honest means evaluating the conversation that happened, not the article coverage that didn't.
