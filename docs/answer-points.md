# Answer points: the discussion bar follows answer quality

*Built 17 November 2026, on for the test learner account only.*

## Why

A student who wants to be done can rush the discussion with a run of short answers. The tutor scored those answers low, but the bar still filled, or the discussion stopped at six messages, so rushing cost nothing and the low score looked like weak comprehension. Answer points make the quality of each answer visible the moment it is sent, so a thoughtful answer is the fast way through.

## What the student sees

- The tutor still scores every answer 0-40, the same score it always gave (`progressDelta`: 0-10 a non-answer, 11-20 a fact repeated, 21-30 an explanation in their own words, 31-40 an inference or connection; quality, not length).
- That score now sets how far the bar moves (`pointsForScore` in `src/lib/answer-points.ts`): 2 for a non-answer, 5 for a fact repeated, 16-25 for an explanation, 26-35 for an inference. About four or five good answers fill the bar; ten thin ones don't.
- A good answer's points (16 or more) rise from the end of the bar and fade. The best answers (26 or more) rise bigger, bolder and in their own colour (`--great`). A thin answer moves the bar without a number, so a reader who is trying and stuck doesn't watch a string of small numbers; the tutor asks for more in its own words, as it always has.
- The bar is taller than before and stays on screen when the discussion ends, so the last answer's fill is seen.

## Rules that keep it honest

- **The discussion ends on the answer that fills the bar** (after at least three answers). The tutor's reply to that answer is asked again as the goodbye, so it costs a second call on the last turn only. Without answer points the goodbye came one exchange after the bar filled.
- **The floor.** After a thin answer, the tutor is told that if the next one is thin too it should make the next directive easier to answer well: point to one specific part of the article and ask the student to explain it in their own words (`HELP_NOTE`). The tutor never mentions points or the bar.
- **The backstop moves from 6 to 10 answers.** At ten the discussion ends unfinished with a goodbye, and the report marks it a forced close as before. A rushed discussion is therefore slower, but it still ends.
- **XP is unchanged.** A discussion that ends at the backstop counts as a finished article, as before. A student set on rushing can still finish with ten quick answers; making XP follow the quality of the discussion is a separate, open decision.

## Who gets it

Only the Compass learner ids in `ANSWER_POINTS_LEARNERS`, on the classic and spring tutors (the redesigned tutor scores in its own observer), never on the tutorial. A conversation that began without answer points keeps the old bar. Each answer's points are kept on the student's message in `conversations.messages` (`points`), and `conversations.progress_score` holds the bar (0-100) for these conversations, so the report's in-chat score is the bar too.

To widen it, add learner ids to the list, or replace the list with a check that is true for everyone.
