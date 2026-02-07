import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST() {
  // Check if already seeded
  const existing = await db.select().from(schema.guides).limit(1);
  if (existing.length > 0) return NextResponse.json({ message: "Already seeded" });

  // Create guide
  const guideHash = await hashPassword("sigma2026");
  const [guide] = await db.insert(schema.guides).values({
    name: "Calie Garrett",
    email: "calie@sigmaschool.us",
    passwordHash: guideHash,
  }).returning();

  // Create student
  const studentHash = await hashPassword("max2026");
  const [student] = await db.insert(schema.students).values({
    name: "Max",
    username: "max",
    passwordHash: studentHash,
    guideId: guide.id,
  }).returning();

  return NextResponse.json({
    message: "Seeded successfully",
    guide: { email: "calie@sigmaschool.us", password: "sigma2026" },
    student: { username: "max", password: "max2026" },
  });
}
