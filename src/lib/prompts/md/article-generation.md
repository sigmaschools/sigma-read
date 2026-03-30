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
- Make it genuinely interesting. Strong opening that hooks the reader. Concrete details and examples.
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