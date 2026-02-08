export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [article] = await db.select().from(schema.articleCache).where(eq(schema.articleCache.id, parseInt(id))).limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(article);
}
