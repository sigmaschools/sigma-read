Write an original nonfiction article for a student with the following profile:

Reading level: {{level}} (Lexile {{lexile}}, Grade {{grade}})
Topic: {{topic}}
Article type: {{type}} (one of: interest_matched, horizon_expanding, news)

CRITICAL LENGTH: {{words}} words. Students read this in 2-5 minutes total (including a brief comprehension discussion). Do NOT exceed the word count.

VOCABULARY RULES: {{vocab}}
- NEVER stack Latin/scientific nomenclature in consecutive sentences.
- If using a proper noun (species name, technical term), explain it immediately.
- The goal is comprehension, not vocabulary exposure.

Requirements:
- Write an ORIGINAL article grounded in real, current information. Do not fabricate facts, statistics, or quotes.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Concrete details and examples throughout.
- OPENING STYLE — MECHANICAL RULE:
  Step 1: Before writing, silently pick ONE style from the list below. Your first word must NOT be "Imagine", "Picture", "What", or "Have" — these are hard-banned. If you start writing one, stop and choose a different style.
  Step 2: Write the opening using ONLY the chosen style. Do not combine styles.
  Available styles:
  1. **Statistic** — Lead with a striking number. E.g., "Every second, 6,000 lightning bolts hit Earth."
  2. **Scene drop** — Drop into a real moment, third-person present tense. E.g., "Deep beneath the Pacific, a robot arm lifts a chunk of rock from the seafloor."
  3. **Historical moment** — Anchor to a specific time and place. E.g., "On July 20, 1969, two astronauts stepped onto a world no human had touched."
  4. **Bold claim** — Open with a surprising fact. E.g., "Octopuses have three hearts — and blue blood."
  5. **Contrast** — Two opposing facts, back to back. E.g., "A bee weighs less than a paperclip. Together, a hive can defend against a bear."
  6. **Q&A** — Ask, then answer immediately. E.g., "How fast is the fastest animal? The peregrine falcon dives at 240 miles per hour."
  7. **Micro-story** — One or two sentences about a real person or event. E.g., "In 2023, a 12-year-old in Texas found a 34-million-year-old whale skull in her backyard."
  Do not repeat the same style across articles in the same batch.
- Age-appropriate for the target grade range.
- Short paragraphs (2-4 sentences each). White space matters for younger readers.
- For news articles: Write original coverage of a recent news event.
- For horizon-expanding articles: The topic should be adjacent to the student's interests but in a new domain.

Output format:

[ARTICLE]
{
  "title": "Article title",
  "topic": "Topic tag",
  "body": "The full article text in markdown format.",
  "sources": ["List of source URLs or publication names"],
  "estimated_read_time_minutes": {{estimatedReadTime}}
}

Do not include any preamble or commentary outside the JSON output.