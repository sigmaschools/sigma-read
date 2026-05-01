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
- OPENING STYLE — variety is mandatory:
  - NEVER start with "Imagine", "Picture this", "What if", "Have you ever wondered", or any second-person imagination invitation. These are banned.
  - Rotate among these distinct opening styles (never repeat the same type twice in a batch):
    1. **Surprising statistic or number** — Lead with a specific, striking fact. E.g., "Every second, 6,000 lightning bolts hit the Earth."
    2. **Present-tense scene drop** — Place the reader in a real moment happening right now. E.g., "Deep beneath the Pacific Ocean, a robot arm carefully lifts a chunk of rock from the seafloor."
    3. **Historical turning point** — Open with a pivotal moment in time. E.g., "On July 20, 1969, two astronauts stepped onto a world no human had ever touched."
    4. **Bold declarative claim** — State something surprising or counterintuitive as fact. E.g., "Octopuses have three hearts — and blue blood."
    5. **Contrast or juxtaposition** — Set up a tension between two ideas. E.g., "A single bee weighs less than a paperclip, but together a hive can lift the roof off a shed."
    6. **Self-answering question** — Ask a question and answer it in the same sentence or the next. E.g., "How fast is the fastest animal on Earth? The peregrine falcon dives at over 240 miles per hour."
    7. **Micro-narrative** — A one- or two-sentence story about a real person or event. E.g., "In 2023, a 12-year-old in Texas found a 34-million-year-old whale skull in her backyard."
  - Pick the style that best fits the topic and article type — but never default to the same one.
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