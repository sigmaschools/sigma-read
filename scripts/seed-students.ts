import { neon } from "@neondatabase/serverless";
import * as bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);

const STUDENTS = [
  {
    name: "Emma", username: "emma", level: 3,
    interests: { primary_interests: ["marine biology", "art", "cooking"], secondary_interests: ["travel", "photography"], notes: "Loves ocean documentaries" },
    sessions: [
      { score: 82, rating: "Strong", understood: "Emma grasped the main concept and connected it to prior knowledge about ecosystems.", missed: "Missed some vocabulary around chemical processes. Didn't engage with the data section.", engagement: "Engaged and asked follow-up questions. Showed genuine curiosity." },
      { score: 71, rating: "Solid", understood: "Understood the central narrative and key characters. Good recall of specific details.", missed: "Struggled with the cause-and-effect chain in the middle section. Missed the author's main argument.", engagement: "Steady engagement but responses were brief." },
      { score: 88, rating: "Strong", understood: "Excellent comprehension. Connected the article to a documentary she watched. Articulated the main thesis clearly.", missed: "Minor gap on one statistical detail. Otherwise thorough.", engagement: "Highly engaged. Volunteered additional context and asked thoughtful questions." },
      { score: 76, rating: "Strong", understood: "Good understanding of the timeline and key events. Recalled specific names and dates.", missed: "Didn't fully grasp the political implications discussed in the final section.", engagement: "Consistent engagement throughout." },
    ]
  },
  {
    name: "Jayden", username: "jayden", level: 2,
    interests: { primary_interests: ["basketball", "video games", "cars"], secondary_interests: ["music", "sneakers"], notes: "Competitive, loves stats and rankings" },
    sessions: [
      { score: 65, rating: "Solid", understood: "Got the main idea and a few supporting details. Understood the competitive angle.", missed: "Missed nuance in the comparison section. Vocabulary gaps on technical terms.", engagement: "Engaged when the topic connected to sports. Less so on technical sections." },
      { score: 58, rating: "Developing", understood: "Recalled the opening hook and conclusion. Basic understanding of the topic.", missed: "Missed most of the middle section details. Couldn't explain the cause-and-effect relationship.", engagement: "Short responses. Seemed distracted toward the end." },
      { score: 72, rating: "Solid", understood: "Strong recall when the article involved statistics and rankings. Connected to his basketball knowledge.", missed: "Struggled with abstract concepts. Missed the broader significance.", engagement: "More engaged than usual. The sports angle helped." },
    ]
  },
  {
    name: "Sofia", username: "sofia", level: 4,
    interests: { primary_interests: ["astronomy", "writing", "mythology"], secondary_interests: ["philosophy", "languages"], notes: "Advanced reader, loves complex narratives" },
    sessions: [
      { score: 94, rating: "Strong", understood: "Exceptional comprehension. Identified the thesis, supporting arguments, and counterpoints. Made inferences beyond the text.", missed: "Nothing significant. Noted one minor factual detail she wasn't sure about.", engagement: "Deeply engaged. Asked questions that went beyond the article content." },
      { score: 91, rating: "Strong", understood: "Articulated complex relationships between concepts. Drew parallels to Greek mythology she'd read.", missed: "Slightly confused one timeline detail but self-corrected.", engagement: "Enthusiastic and articulate. Natural conversationalist." },
      { score: 87, rating: "Strong", understood: "Solid grasp of the scientific concepts. Explained the process in her own words accurately.", missed: "Less confident with the quantitative data. Skimmed over the statistics.", engagement: "Good engagement but less animated than with humanities topics." },
      { score: 93, rating: "Strong", understood: "Outstanding. Connected the historical events to modern parallels. Identified author bias.", missed: "No significant gaps.", engagement: "Peak engagement. This was clearly a topic she loved." },
      { score: 85, rating: "Strong", understood: "Good understanding of the technical process described. Translated jargon into plain language.", missed: "Missed one key distinction between two similar concepts.", engagement: "Steady and focused." },
    ]
  },
  {
    name: "Marcus", username: "marcus", level: 1,
    interests: { primary_interests: ["dinosaurs", "Legos", "dogs"], secondary_interests: ["volcanoes", "trucks"], notes: "Youngest reader, enthusiastic but needs support" },
    sessions: [
      { score: 45, rating: "Developing", understood: "Remembered the main topic and one or two vivid details (the size comparison).", missed: "Couldn't articulate the main idea. Mixed up several key facts. Vocabulary was a barrier.", engagement: "Tried hard but seemed frustrated. Shortened responses toward the end." },
      { score: 52, rating: "Developing", understood: "Better recall this time. Got the basic who/what/where. Enjoyed the animal content.", missed: "Missed the why — couldn't explain motivations or causes. Timeline was jumbled.", engagement: "More relaxed than last session. The dog-related content helped." },
      { score: 61, rating: "Solid", understood: "Significant improvement. Articulated the main idea and two supporting details. Used a vocabulary word from the article.", missed: "Still struggles with inference. Took details at face value without connecting them.", engagement: "Noticeable confidence boost. Smiled when he got an answer right." },
    ]
  },
  {
    name: "Aisha", username: "aisha", level: 3,
    interests: { primary_interests: ["fashion design", "dance", "social justice"], secondary_interests: ["psychology", "entrepreneurship"], notes: "Creative thinker, strong opinions" },
    sessions: [
      { score: 78, rating: "Strong", understood: "Clear understanding of the central argument. Connected it to her own observations about fairness.", missed: "Glossed over the historical context section. Focused more on the opinion than the evidence.", engagement: "Very engaged. Had strong reactions and wanted to debate." },
      { score: 74, rating: "Solid", understood: "Good comprehension of the narrative arc. Identified the turning point correctly.", missed: "Missed some technical details in the process description.", engagement: "Steady engagement. Asked one really insightful question." },
      { score: 81, rating: "Strong", understood: "Excellent grasp of the design and creativity aspects. Made connections to her own design work.", missed: "Less attentive to the business/economics angle of the article.", engagement: "Animated and enthusiastic. This topic clearly resonated." },
      { score: 69, rating: "Solid", understood: "Understood the basics but was less interested in this topic. Got the main idea.", missed: "Missed several key details and the cause-effect chain.", engagement: "Polite but clearly less invested. Shorter responses." },
    ]
  },
  {
    name: "Liam", username: "liam", level: 2,
    interests: { primary_interests: ["fishing", "hunting", "football"], secondary_interests: ["woodworking", "camping"], notes: "Hands-on learner, prefers concrete topics" },
    sessions: [
      { score: 63, rating: "Solid", understood: "Good recall of concrete facts and numbers. Understood the practical applications.", missed: "Struggled with abstract reasoning. Couldn't connect the concept to the bigger picture.", engagement: "Engaged when discussing practical, real-world applications." },
      { score: 55, rating: "Developing", understood: "Remembered the opening and a few details. Got the general topic.", missed: "Lost the thread in the middle. Couldn't distinguish between two key concepts.", engagement: "Fading attention. Responses got shorter as the conversation went on." },
    ]
  },
  {
    name: "Zara", username: "zara", level: 3,
    interests: { primary_interests: ["robotics", "math", "chess"], secondary_interests: ["coding", "puzzles"], notes: "Analytical thinker, enjoys problem-solving" },
    sessions: [
      { score: 85, rating: "Strong", understood: "Precise recall of technical details. Explained the process step-by-step. Strong analytical thinking.", missed: "Less attentive to the human interest angle of the story.", engagement: "Focused and methodical. Asked clarifying questions about specifics." },
      { score: 79, rating: "Strong", understood: "Good understanding of the logical structure. Identified patterns the article described.", missed: "Missed some contextual/historical background.", engagement: "Consistent engagement. Preferred the data-heavy sections." },
      { score: 83, rating: "Strong", understood: "Connected the concepts to her robotics experience. Explained implications clearly.", missed: "Skipped over the ethical considerations section.", engagement: "Very engaged with the technical content." },
    ]
  },
  {
    name: "Diego", username: "diego", level: 2,
    interests: { primary_interests: ["soccer", "cooking", "comics"], secondary_interests: ["animation", "music"], notes: "Bilingual (Spanish/English), creative storyteller" },
    sessions: [
      { score: 70, rating: "Solid", understood: "Good understanding of the narrative. Retold the story in his own words effectively.", missed: "Some vocabulary gaps. Confused two similar-sounding terms.", engagement: "Engaged and expressive. Used gestures while explaining." },
      { score: 66, rating: "Solid", understood: "Got the basic facts right. Understood the sequence of events.", missed: "Missed the deeper significance. Took the article at face value.", engagement: "Moderate engagement. Perked up when food was mentioned." },
      { score: 74, rating: "Solid", understood: "Strong recall of visual and descriptive details. Good at summarizing.", missed: "Inference questions were harder. Needed prompting to go deeper.", engagement: "Good engagement overall. Natural storyteller in his responses." },
      { score: 71, rating: "Solid", understood: "Understood the competitive aspect well. Connected to his soccer experience.", missed: "Missed the science behind the topic. Focused on the human story.", engagement: "Steady. More engaged with people-focused content than data." },
    ]
  },
];

async function main() {
  const guideId = 1; // Calie

  for (const s of STUDENTS) {
    console.log(`Creating ${s.name}...`);

    // Check if student already exists
    const existing = await sql.query("SELECT id FROM students WHERE username = $1", [s.username]);
    if (existing.length > 0) {
      console.log(`  ${s.name} already exists, skipping`);
      continue;
    }

    // Create student
    const hash = await bcrypt.hash(s.username + "2026", 10);
    const [student] = await sql.query(
      `INSERT INTO students (name, username, password_hash, guide_id, reading_level, interest_profile, onboarding_complete)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [s.name, s.username, hash, guideId, s.level, JSON.stringify(s.interests)]
    ) as any[];

    const studentId = student.id;

    // Get cached articles for this student's level
    const articles = await sql.query(
      "SELECT id, title, topic, body_text, reading_level, sources, estimated_read_time FROM article_cache WHERE reading_level = $1 ORDER BY RANDOM() LIMIT $2",
      [s.level, s.sessions.length + 2]
    );

    // Create articles + sessions + reports for each session
    for (let i = 0; i < s.sessions.length && i < articles.length; i++) {
      const art = articles[i] as any;
      const sess = s.sessions[i];

      // Insert article for student
      const [article] = await sql.query(
        `INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, read, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'news') RETURNING id`,
        [studentId, art.title, art.topic, art.body_text, art.reading_level, JSON.stringify(art.sources || []), art.estimated_read_time || 4]
      ) as any[];

      // Create reading session (completed days ago for variety)
      const daysAgo = s.sessions.length - i;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const endDate = new Date(startDate.getTime() + 15 * 60 * 1000); // 15 min later

      const [session] = await sql.query(
        `INSERT INTO reading_sessions (student_id, article_id, started_at, completed_at)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [studentId, article.id, startDate.toISOString(), endDate.toISOString()]
      ) as any[];

      // Create conversation
      const transcript = [
        { role: "assistant", content: "What was this article mainly about?" },
        { role: "user", content: "It was about " + art.topic.toLowerCase() + " and how it affects things." },
        { role: "assistant", content: "Good. Can you tell me a specific detail you remember?" },
        { role: "user", content: "Yeah, I remember the part about the main thing they discovered." },
        { role: "assistant", content: "Nice. Why do you think that matters?" },
        { role: "user", content: "Because it changes how we understand the topic." },
        { role: "assistant", content: "Great job working through that article." },
      ];

      const [convo] = await sql.query(
        `INSERT INTO conversations (reading_session_id, messages, complete)
         VALUES ($1, $2, true) RETURNING id`,
        [session.id, JSON.stringify(transcript)]
      ) as any[];

      // Create comprehension report
      await sql.query(
        `INSERT INTO comprehension_reports (conversation_id, score, rating, understood, missed, engagement_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [convo.id, sess.score, sess.rating, sess.understood, sess.missed, sess.engagement]
      );

      console.log(`  Session ${i + 1}: "${art.title}" → ${sess.score} (${sess.rating})`);
    }

    // Add 2 unread articles
    for (let i = s.sessions.length; i < Math.min(s.sessions.length + 2, articles.length); i++) {
      const art = articles[i] as any;
      await sql.query(
        `INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, read, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'news')`,
        [studentId, art.title, art.topic, art.body_text, art.reading_level, JSON.stringify(art.sources || []), art.estimated_read_time || 4]
      );
    }

    console.log(`  ✓ ${s.name}: ${s.sessions.length} sessions, level ${s.level}`);
  }

  console.log("\nDone! 8 students seeded.");
}

main();
