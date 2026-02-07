import { db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";

async function main() {
  // Get Carolyn's students
  const students = await db.select().from(schema.students).where(eq(schema.students.guideId, 2));
  
  const emma = students.find(s => s.username === "emma_c");
  const sofia = students.find(s => s.username === "sofia_c");
  const marcus = students.find(s => s.username === "marcus_c");

  if (!emma || !sofia || !marcus) {
    console.error("Missing students");
    process.exit(1);
  }

  // Create articles and sessions for each student
  const articleTemplates = [
    { title: "How Wolves Changed Yellowstone", topic: "Nature", level: 3 },
    { title: "The Science Behind Rainbows", topic: "Science", level: 3 },
    { title: "Kids Who Became Inventors", topic: "History", level: 3 },
    { title: "Why Do Cats Purr?", topic: "Animals", level: 2 },
    { title: "Ocean Explorers Find New Species", topic: "Nature", level: 2 },
    { title: "How Bridges Stay Up", topic: "Engineering", level: 2 },
    { title: "What Makes a Thunderstorm?", topic: "Science", level: 1 },
    { title: "Dogs That Help People", topic: "Animals", level: 1 },
    { title: "Fun Facts About the Moon", topic: "Space", level: 1 },
  ];

  // Emma: 4 sessions, scores 76, 82, 68, 85 (improving)
  const emmaScores = [76, 82, 68, 85];
  const emmaRatings = ["Solid", "Strong", "Solid", "Exceptional"];
  const emmaSelfAssess = ["pretty_well", "really_well", "not_sure", "really_well"];

  for (let i = 0; i < 4; i++) {
    const t = articleTemplates[i];
    const [article] = await db.insert(schema.articles).values({
      studentId: emma.id,
      title: t.title,
      topic: t.topic,
      bodyText: `Article content for "${t.title}" — this is placeholder text for testing the guide dashboard.`,
      readingLevel: t.level,
      read: true,
      liked: i % 2 === 0,
      sources: [],
    }).returning();

    const [session] = await db.insert(schema.readingSessions).values({
      studentId: emma.id,
      articleId: article.id,
      completedAt: new Date(Date.now() - (4 - i) * 24 * 60 * 60 * 1000),
    }).returning();

    const [conv] = await db.insert(schema.conversations).values({
      readingSessionId: session.id,
      messages: [
        { role: "assistant", content: "What was this article mainly about?" },
        { role: "user", content: "It was about " + t.topic.toLowerCase() },
        { role: "assistant", content: "Can you tell me one specific detail?" },
        { role: "user", content: "I remember it talked about some interesting facts." },
      ],
      complete: true,
    }).returning();

    await db.insert(schema.comprehensionReports).values({
      conversationId: conv.id,
      score: emmaScores[i],
      rating: emmaRatings[i],
      understood: "Student demonstrated understanding of the main topic and some key details.",
      missed: "Some nuance and supporting details were not recalled.",
      engagementNote: "Good engagement level.",
      selfAssessment: emmaSelfAssess[i],
    });
  }
  console.log("Seeded Emma's data (4 sessions)");

  // Sofia: 5 sessions, scores 72, 74, 71, 78, 75 (consistent)
  const sofiaScores = [72, 74, 71, 78, 75];
  const sofiaRatings = ["Strong", "Strong", "Solid", "Strong", "Strong"];

  for (let i = 0; i < 5; i++) {
    const t = articleTemplates[i + 3];
    const [article] = await db.insert(schema.articles).values({
      studentId: sofia.id,
      title: t.title,
      topic: t.topic,
      bodyText: `Article content for "${t.title}" — placeholder text.`,
      readingLevel: t.level,
      read: true,
      liked: true,
      sources: [],
    }).returning();

    const [session] = await db.insert(schema.readingSessions).values({
      studentId: sofia.id,
      articleId: article.id,
      completedAt: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000),
    }).returning();

    const [conv] = await db.insert(schema.conversations).values({
      readingSessionId: session.id,
      messages: [
        { role: "assistant", content: "What was this article mainly about?" },
        { role: "user", content: "It talked about " + t.topic.toLowerCase() },
      ],
      complete: true,
    }).returning();

    await db.insert(schema.comprehensionReports).values({
      conversationId: conv.id,
      score: sofiaScores[i],
      rating: sofiaRatings[i],
      understood: "Solid grasp of the main idea and several key points.",
      missed: "Deeper analysis and inference were limited.",
      engagementNote: "Consistent engagement.",
    });
  }
  console.log("Seeded Sofia's data (5 sessions)");

  // Marcus: 3 sessions, scores 42, 38, 45 (struggling)
  const marcusScores = [42, 38, 45];
  const marcusRatings = ["Developing", "Struggled", "Developing"];
  const marcusSelfAssess = ["not_sure", "lost", "not_sure"];

  for (let i = 0; i < 3; i++) {
    const t = articleTemplates[i + 6];
    const [article] = await db.insert(schema.articles).values({
      studentId: marcus.id,
      title: t.title,
      topic: t.topic,
      bodyText: `Article content for "${t.title}" — placeholder text.`,
      readingLevel: t.level,
      read: true,
      liked: i === 2,
      sources: [],
    }).returning();

    const [session] = await db.insert(schema.readingSessions).values({
      studentId: marcus.id,
      articleId: article.id,
      completedAt: new Date(Date.now() - (3 - i) * 24 * 60 * 60 * 1000),
    }).returning();

    const [conv] = await db.insert(schema.conversations).values({
      readingSessionId: session.id,
      messages: [
        { role: "assistant", content: "What was this article mainly about?" },
        { role: "user", content: "I don't really remember" },
        { role: "assistant", content: "That's okay. What do you remember about " + t.topic.toLowerCase() + "?" },
        { role: "user", content: "Not much" },
      ],
      complete: true,
    }).returning();

    await db.insert(schema.comprehensionReports).values({
      conversationId: conv.id,
      score: marcusScores[i],
      rating: marcusRatings[i],
      understood: "Limited recall of the main topic.",
      missed: "Most key details and the main argument were not demonstrated.",
      engagementNote: "Low engagement. Student seemed uncertain.",
      selfAssessment: marcusSelfAssess[i],
    });
  }
  console.log("Seeded Marcus's data (3 sessions)");

  console.log("\nDone! Carolyn's dashboard should now show meaningful data.");
  process.exit(0);
}

main().catch(console.error);
