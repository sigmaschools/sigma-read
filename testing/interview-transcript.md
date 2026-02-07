# SigmaRead UX Interview Transcript

**Interviewer:** Cole
**Subject:** Wayne Vaughan (Founder)
**Date:** February 7, 2026
**Duration:** ~90 minutes (guide testing + interview)

---

## Guide Experience Feedback

### Dashboard First Impression
Wayne: "First impression is the dashboard looks clean and minimal, like an MVP. The student list has some confusing elements. It could be easy to confuse the reading level with the grade level. Guides need to know if the student is struggling or succeeding at a glance. Seeing how many sessions they completed this week is less important."

### Weekly Summary Modal
Wayne: "This is useful information. I like how Max is listed at the top because he hasn't completed onboarding. I would rank order these students from highest score to lowest score. The best and lowest elements of each row are not useful. The arrows to the right of the score indicate that there is another screen to view more information about that student, but there are no clickable links. For each student, I think you would want to know grade level and reading level at a glance."

### Score Trends
Wayne: "The score trend does tell a story. However, the trend isn't that meaningful over such a short time period. Scores over longer durations could be more meaningful. Examples: All time, the past 30 days, 6 months, 1 year."

### Comprehension Reports & Transcripts
Wayne: "Reading sessions should probably be broken out into a separate screen. The guide needs to see the article that the student read, the assessment, and the transcript. I suggest displaying this transcript in a way that closely matches the view of the actual chat session between the student and the AI. Shorter comprehension reports are generally better. Guides might want to know if a student liked or disliked the article."

### Test Data Quality Issue
Wayne: "The scores do not match the quality of the conversation from the test data. For example, Emma read an article about NASA's Artemis program and got a score of 76. Her transcript shows very little comprehension of the article. Overall, the testing of all student assessments appears to be poorly executed. High scores are associated with low quality transcripts."

Cole: "The seeded test data uses generic placeholder transcripts but I assigned varied scores manually. Real conversations will produce honest scores that match actual transcript quality."

### Sparkline Charts
Wayne: "Sparkline charts are useless. The guide needs to know which students are succeeding and which are struggling at a glance. More useful metrics would be sessions completed, time in-app, and score. Score is equated with mastery."

### Student Data Fields
Wayne: "We should capture the student's age and grade level. In time, we may add fields, but for now, let's keep it simple."

### Additional Guide UX Issues
- Sign out button not immediately visible — recommend fixed at bottom of sidebar
- No way to search or filter student list
- Student name only displays first name — problematic with duplicate names
- Page load seemed slow despite few students

---

## Student Experience Feedback

### Home Page (logged in as Emma)
Wayne: "I like how the focus is clearly on the next article that I'm supposed to read. I clicked more articles to see what happened. And I liked how new articles appeared. That makes me feel like I have a choice. If I didn't like the first article, I could get a different article. But we should definitely limit this. We don't want kids overloading themselves with new articles."

**Decision:** Cap total unread articles (not daily limit).

Wayne: "When new articles loaded, they have a blue news indicator on the left hand side of the item. Just below it, there's also displayed News · 3 min read. This is redundant. We can get rid of the blue news."

Wayne: "I think it's important that we clearly show students that we understand their interests and that we're serving them articles that are both news related and articles relevant to their interests."

Wayne: "As a student, there's no way for me to tell it that I'm interested in something new. We should address that somewhere in the application."

**Decision:** Organic interest update — "something more organic, that fits with the model of an AI-first application."

### Article Reader
Wayne: "At the top of the article, there's a before you read box. This is confusing. I have no idea what this is for."

**Decision:** "Let's try to find a way to fix the pre-reading box. Just because it's awkward on the first time doesn't mean we shouldn't give it at least one more shot."

Wayne: "I really like the feature where you can mouse over a word and get a definition. Young students might find it useful to also get a pronunciation. In the modal that displays the definition, you could put a button that, when clicked, plays the audio of the word."

Wayne: "The style and font selection and column width constraints make it very easy to read."

Wayne: "The reading level on this article seems high."

Example passage cited: "The newly identified species, named Australovenator argentinensis, measured nearly 30 feet long... The dinosaur belongs to the carcharodontosaurid family..."

**Cole:** "That's too hard for Level 3. Stacked Latin nomenclature in two sentences. Prompt needs tighter vocabulary guardrails per level."

Wayne: "I would like a dark mode reading option."

Wayne: "I clicked yes that I enjoyed the article. The AI that does the assessment should know whether the student clicked yes or no and that should inform the conversation with the student."

Wayne: "Should we include a link to the source or sources? That could be distracting. Generally speaking, we want to give students a single path forward and keep them focused."

**Decision:** Sources behind a collapsed toggle, or removed entirely. Single path forward.

### Article Feedback Auto-Flow
Wayne: "We should probably do the same thing where a student likes or dislikes an article. Have them click like, display some feedback, and then take them to the comprehension discussion."

**Decision:** Like/dislike → brief feedback → auto-transition to conversation. Remove separate "Done Reading" button.

### Comprehension Conversation
Wayne: "The comprehension chat feels much better than it did in the past. It felt like I was talking to a teacher. Not having the article on the screen forces me to use my recall. This is harder for the student, but it might be better for helping them learn. There's a big difference between reading an article and understanding it and getting a question and skimming an article for the answer."

Wayne: "Some kids are going to find this frustrating at first."

Wayne: "I like how you added the question, how well do you think you understood this article? That's the most important piece of feedback we could get from the student. This new information should be surfaced to the guides."

Wayne: "Do we need a separate button for back to home? What if the student just picked how well they understood the article and the system automatically took them to the next place they need to be?"

**Decision:** Self-assessment click → auto-navigate home. Remove "Back to Home" button.

### Peek at Article During Conversation
Cole proposed a "Peek at the article" button during conversation, tracked for guides.

Wayne: "I like your peek at the article idea. We should think carefully about this, though. It needs guidelines. Otherwise, the Reading Comprehension app becomes the skim the article and find the fact app."

**Decision:** Park for v2. Needs careful guidelines if implemented.

### My Sessions Page
Cole: "I added it because the PRD included it and it's a standard pattern. But I think it's low-value."

Wayne: "I agree. Kill it. Most education apps give kids way too many options. We always want to maintain the minimal experience that guides the student through the learning process. Generally speaking, students should only have one path forward."

**Decision:** Remove My Sessions entirely.

---

## Product Vision Questions

### Identity
Wayne: "SigmaRead is a beautifully designed app that helps young readers improve their reading comprehension."

### What SigmaRead Is NOT
1. "Not a political indoctrination tool"
2. "Not boring and frustrating"
3. "Designed for the way students learn, not the way classrooms operate"
4. "Not full of hallucinated facts and misinformation"
5. "Makes improving your reading comprehension fun and easy"
6. "Not for schools or teachers that want to have tight editorial control over the articles they give to students"
7. "Not for schools that operate in a way where the entire class needs to be functioning at the same level at the same time. Everything is personalized to the individual."

### Ideal Student Session (Max's Perfect Day)
"Max logs in. He's already excited to use the application because using SigmaRead is one of the more fun and relaxing parts of his day at Sigma School. He knows that he's going to get to read about things that are interesting to him. Max lands on the dashboard and he sees five articles that are ready for him to read. He knows that if he reads the articles and does well on the comprehension report that he will earn XP. Max reads an article about the fires in Los Angeles. Max is engaged because he's always loved firefighting. The reading level is perfectly attuned to him. He comes across a word he doesn't know, so he clicks on it and gets a definition and clicks on a button to hear the pronunciation. When Max is finished reading, he clicks yes that he likes the article and moves on to talk with the AI. He has a brief conversation with the AI about the article. It feels like he's talking to one of his human guides. The structure of these conversations is not identical, but there's enough consistency where Max comes into the conversation with the expectation of what's going to happen and how long the conversation will take. He knows it's an easy task. Sometimes during these conversations, the AI asks Max if they should add anything from the article to his interests or dislikes. Max likes this because it gives him more control over the kind of articles that he's going to read in the future. After the conversation wraps up, he moves on to the next article and repeats the process until all of his articles for the day are read."

### What Breaks the Experience
"Max logs in dreading to use SigmaRead. It's always a bunch of boring news articles that have nothing to do with his interests. Sometimes the articles are too hard for him to read. Sometimes they are full of facts that are not true. Max's parents can tell that SigmaRead is being used to push woke ideology on the students. The chatbot is terrible. It asks the same questions every time. It has an inauthentic voice. There is no joy, there is no fun in using SigmaRead. It's a chore Max has to do every day."

### XP System
"XP is part of a broader strategy for Sigma. Ultimately, SigmaRead will be one module inside Compass. As students complete work, they earn XP. We want to implement something that is similar to the way that Math Academy implements XP. It is explicitly not a gamification tactic. Instead, XP helps young students recognize that they are making progress as they work. This is analogous to leveling up a character in a video game."

**Action:** Research Math Academy's XP implementation.

### Articles Per Day
"I'm not sure about the number of articles per day. That value might be dynamic based on the student. The number of choices should exceed the required articles for a single day. Five initial choices with three required articles seems like a good starting point. We can test it and make changes based on the feedback we receive."

### Competitive Positioning
"SigmaRead gets to know your kid. It has a great user experience. No multiple choice questions or fill in the blank answers. Kids discuss the articles they read with an AI that does a real job of assessing reader comprehension. They can look up any word they don't know the definition for and get its pronunciation. We have a strong track record of improved reading comprehension scores on standardized tests for students who are using SigmaRead."

### Success Metrics
"Three times a year, students at Sigma take MAP tests. We can clearly see the growth of reading comprehension in these standardized test scores. Additionally, SigmaRead has built-in metrics that track the reading comprehension, Lexile levels, and other factors that help us understand how well a student is actually comprehending what they're reading. Parents and guides have a dashboard where they can view these metrics. Sigma also uses these metrics dynamically to adjust the content and the experience."

### 30-Day Build Fence
"We shouldn't build anything that overcomplicates the user experience. We shouldn't add features for the sake of adding features. It should always be tied back to a set of core values and principles. I'll note that we haven't yet defined those core values and principles, so we should probably take some time to do that. I think it's smart that we didn't define those up front because we're better informed now that we've seen a working version of the app."

---

## Key Decisions Summary

| Decision | Detail |
|----------|--------|
| Kill My Sessions | Students have one path forward |
| Kill sparkline charts | Replace with at-a-glance success/struggling indicators |
| Cap unread articles | Total cap, not daily limit |
| Auto-navigate on self-assessment | Remove "Back to Home" button |
| Auto-navigate on like/dislike | Remove "Done Reading" button, like → conversation |
| Add grade level + age | To student profiles |
| Add full name | First + last name for students |
| Fix pre-reading box | Try once more with better framing |
| Tighten reading level prompts | Vocabulary guardrails per level |
| Add pronunciation audio | To word definition feature |
| Add dark mode | For reader |
| Surface self-assessment to guides | In reports and weekly summary |
| Like/dislike informs conversation | AI knows if student enjoyed article |
| Sources collapsed or removed | Single path forward |
| Organic interest updates | AI asks during conversation |
| Research Math Academy XP | Model for Compass-wide XP system |
| Define core values + principles | Ongoing process, better informed now |
| Guide dashboard: sort by score | Struggling students surface first |
| Guide dashboard: batch API | Fix slow load (11 sequential requests) |
| Search/filter for student list | Needed at scale |
| Sign out fixed at bottom | Of sidebar |
