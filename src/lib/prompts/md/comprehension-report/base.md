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

Output format:

[REPORT]
{
  "score": 74,
  "rating": "Solid",
  "comprehension": "2-3 sentences on how well the student demonstrated understanding of the article's main ideas and concepts, based on what came up in the conversation.",
  "depth": "2-3 sentences on the quality of their thinking. Did they explain ideas in their own words? Make connections? Go beyond surface recall? A student who says 'I think scientists were surprised because they didn't expect life there' shows more depth than one who just restates a fact from the article.",
  "engagement": "1-2 sentences on participation quality and effort."
}

No preamble. No softening. The guide needs honest signal — but honest means evaluating the conversation that happened, not the article coverage that didn't.