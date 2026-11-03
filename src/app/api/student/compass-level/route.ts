export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLevelReport } from "@/lib/compass-report-data";

/** The signed-in student's `level` report for Compass (rendered in the page, never shown). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json({ report: await getLevelReport(session.userId) });
  } catch (e) {
    console.error("Compass level report failed:", e);
    return NextResponse.json({ report: null }, { status: 500 });
  }
}
