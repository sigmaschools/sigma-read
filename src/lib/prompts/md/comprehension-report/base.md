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
- 55-69: Solid for their level — grasps the basics but missed some grade-appropriate details
- 40-54: Developing — below grade-level expectations, missed key ideas
- Below 40: Struggled — could not articulate what the article was about

A Level 1 student who says "it was about a penguin that was pink and scientists were surprised" should score 75-85. That's a strong, concrete retelling for a Grade 2-3 student. Do NOT penalize young students for lacking inferential or analytical skills they haven't developed yet.

Output format:

[REPORT]
{
  "score": 74,
  "rating": "Solid",
  "understood": "2-3 sentences about what they understood.",
  "missed": "2-3 sentences about what they missed or could improve on — calibrated to grade-level expectations.",
  "engagement": "1-2 sentences on engagement level and effort."
}

No preamble. No softening. The guide needs honest signal — but honest means age-appropriate, not adult-appropriate.