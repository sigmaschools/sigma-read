import { db, schema } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function main() {
  const passwordHash = await bcrypt.hash("sigma2026", 10);

  // Check if Carolyn's account already exists
  const existing = await db.select().from(schema.guides).where(eq(schema.guides.email, "carolyn@sigmaschool.us")).limit(1);
  
  let guideId: number;
  
  if (existing.length > 0) {
    guideId = existing[0].id;
    console.log("Carolyn's guide account already exists (id:", guideId, ")");
  } else {
    const [guide] = await db.insert(schema.guides).values({
      name: "Carolyn Vaughan",
      email: "carolyn@sigmaschool.us",
      passwordHash,
    }).returning();
    guideId = guide.id;
    console.log("Created guide account for Carolyn (id:", guideId, ")");
  }

  // Assign Emma, Sofia, and Marcus to Carolyn (update their guideId)
  // First find them
  const emma = await db.select().from(schema.students).where(eq(schema.students.username, "emma")).limit(1);
  const sofia = await db.select().from(schema.students).where(eq(schema.students.username, "sofia")).limit(1);
  const marcus = await db.select().from(schema.students).where(eq(schema.students.username, "marcus")).limit(1);

  // Create copies of these students under Carolyn's account (so Calie's dashboard isn't affected)
  const studentData = [
    { name: "Emma Chen", username: "emma_c", level: 3 },
    { name: "Sofia Martinez", username: "sofia_c", level: 2 },
    { name: "Marcus Williams", username: "marcus_c", level: 1 },
  ];

  for (const s of studentData) {
    const existing = await db.select().from(schema.students).where(eq(schema.students.username, s.username)).limit(1);
    if (existing.length > 0) {
      console.log(`Student ${s.name} (${s.username}) already exists`);
      continue;
    }
    
    const [student] = await db.insert(schema.students).values({
      name: s.name,
      username: s.username,
      passwordHash,
      guideId,
      readingLevel: s.level,
      onboardingComplete: true,
      interestProfile: { interests: ["science", "animals", "art"] },
    }).returning();
    console.log(`Created student ${s.name} (id: ${student.id})`);
  }

  console.log("\nCarolyn can log in with: carolyn@sigmaschool.us / sigma2026");
  process.exit(0);
}

main().catch(console.error);
