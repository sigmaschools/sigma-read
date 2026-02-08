export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { eq, count, gte } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const guides = await db.select({
    id: schema.guides.id,
    name: schema.guides.name,
    email: schema.guides.email,
    createdAt: schema.guides.createdAt,
  }).from(schema.guides);

  // Student counts per guide
  const studentCounts = await db.select({
    guideId: schema.students.guideId,
    total: count(),
  }).from(schema.students).groupBy(schema.students.guideId);
  const countMap: Record<number, number> = {};
  studentCounts.forEach(s => { countMap[s.guideId] = s.total; });

  const result = guides.map(g => ({
    ...g,
    studentCount: countMap[g.id] || 0,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email, password } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const [guide] = await db.insert(schema.guides).values({ name, email, passwordHash }).returning();

  return NextResponse.json(guide);
}
