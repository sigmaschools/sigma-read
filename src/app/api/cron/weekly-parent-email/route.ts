export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import jwt from "jsonwebtoken";
import { db, schema } from "@/lib/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { getScoreZone, getScoreTrend } from "@/lib/score-zones";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

export async function POST(req: NextRequest) {
  // Authenticate via CRON_SECRET
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  // Get all parent-child pairs
  const pairs = await db
    .select({
      parentId: schema.parents.id,
      parentName: schema.parents.name,
      parentEmail: schema.parents.email,
      studentId: schema.students.id,
      studentName: schema.students.name,
    })
    .from(schema.studentParents)
    .innerJoin(schema.parents, eq(schema.studentParents.parentId, schema.parents.id))
    .innerJoin(schema.students, eq(schema.studentParents.studentId, schema.students.id));

  let sent = 0;
  let skipped = 0;

  for (const pair of pairs) {
    try {
      // Get sessions completed this week
      const thisWeekSessions = await db
        .select({
          id: schema.readingSessions.id,
          articleId: schema.readingSessions.articleId,
          completedAt: schema.readingSessions.completedAt,
        })
        .from(schema.readingSessions)
        .where(
          and(
            eq(schema.readingSessions.studentId, pair.studentId),
            gte(schema.readingSessions.completedAt, oneWeekAgo)
          )
        );

      if (thisWeekSessions.length === 0) {
        skipped++;
        continue;
      }

      // Get comprehension scores for this week's sessions
      const thisWeekSessionIds = thisWeekSessions.map((s) => s.id);
      const thisWeekConvos = await db
        .select({
          readingSessionId: schema.conversations.readingSessionId,
          conversationId: schema.conversations.id,
        })
        .from(schema.conversations)
        .where(inArray(schema.conversations.readingSessionId, thisWeekSessionIds));

      const thisWeekConvoIds = thisWeekConvos.map((c) => c.conversationId);
      let thisWeekScores: number[] = [];
      if (thisWeekConvoIds.length > 0) {
        const reports = await db
          .select({ score: schema.comprehensionReports.score })
          .from(schema.comprehensionReports)
          .where(inArray(schema.comprehensionReports.conversationId, thisWeekConvoIds));
        thisWeekScores = reports.map((r) => r.score);
      }

      // Get prior week scores for trend comparison
      const lastWeekSessions = await db
        .select({ id: schema.readingSessions.id })
        .from(schema.readingSessions)
        .where(
          and(
            eq(schema.readingSessions.studentId, pair.studentId),
            gte(schema.readingSessions.completedAt, twoWeeksAgo),
            // completedAt < oneWeekAgo — filter in JS since drizzle lacks lt for dates easily
          )
        );
      const lastWeekOnly = lastWeekSessions.filter(
        (s) => !thisWeekSessionIds.includes(s.id)
      );
      let lastWeekScores: number[] = [];
      if (lastWeekOnly.length > 0) {
        const lastWeekConvos = await db
          .select({ conversationId: schema.conversations.id })
          .from(schema.conversations)
          .where(
            inArray(
              schema.conversations.readingSessionId,
              lastWeekOnly.map((s) => s.id)
            )
          );
        const lastWeekConvoIds = lastWeekConvos.map((c) => c.conversationId);
        if (lastWeekConvoIds.length > 0) {
          const reports = await db
            .select({ score: schema.comprehensionReports.score })
            .from(schema.comprehensionReports)
            .where(inArray(schema.comprehensionReports.conversationId, lastWeekConvoIds));
          lastWeekScores = reports.map((r) => r.score);
        }
      }

      // Level changes this week
      const levelChanges = await db
        .select({
          fromLevel: schema.levelHistory.fromLevel,
          toLevel: schema.levelHistory.toLevel,
        })
        .from(schema.levelHistory)
        .where(
          and(
            eq(schema.levelHistory.studentId, pair.studentId),
            gte(schema.levelHistory.changedAt, oneWeekAgo)
          )
        );

      // Top 3 article titles
      const articleIds = thisWeekSessions.map((s) => s.articleId);
      let articleTitles: string[] = [];
      if (articleIds.length > 0) {
        const articles = await db
          .select({ title: schema.articles.title })
          .from(schema.articles)
          .where(inArray(schema.articles.id, articleIds));
        articleTitles = articles.map((a) => a.title);
      }

      // Calculate stats
      const sessionsCount = thisWeekSessions.length;
      const avgScore =
        thisWeekScores.length > 0
          ? Math.round(thisWeekScores.reduce((a, b) => a + b, 0) / thisWeekScores.length)
          : null;
      const lastWeekAvg =
        lastWeekScores.length > 0
          ? Math.round(lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length)
          : null;

      const zone = avgScore !== null ? getScoreZone(avgScore) : null;
      const trend =
        avgScore !== null && lastWeekAvg !== null
          ? getScoreTrend(avgScore, lastWeekAvg)
          : null;

      // Generate auto-login JWT
      const autoLoginToken = jwt.sign(
        { userId: pair.parentId, role: "parent" as const, childId: pair.studentId, autoLogin: true },
        JWT_SECRET,
        { expiresIn: "48h" }
      );
      const loginUrl = `${process.env.APP_URL}/api/auth/auto-login?token=${autoLoginToken}`;

      const html = buildEmailHtml({
        childName: pair.studentName,
        sessionsCount,
        avgScore,
        zone,
        trend,
        levelChanges,
        articleTitles,
        loginUrl,
      });

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "SigmaRead <noreply@sigmaread.app>",
        to: pair.parentEmail,
        subject: `${pair.studentName}'s Weekly Reading Update`,
        html,
      });

      sent++;
    } catch (err) {
      console.error(`Failed to send email for parent ${pair.parentId}, student ${pair.studentId}:`, err);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped });
}

// --- Email template ---

interface EmailData {
  childName: string;
  sessionsCount: number;
  avgScore: number | null;
  zone: { label: string; color: string } | null;
  trend: { label: string; arrow: string } | null;
  levelChanges: { fromLevel: number; toLevel: number }[];
  articleTitles: string[];
  loginUrl: string;
}

function buildEmailHtml(data: EmailData): string {
  const { childName, sessionsCount, avgScore, zone, trend, levelChanges, articleTitles, loginUrl } = data;

  const scoreDisplay = avgScore !== null ? `${avgScore}` : "—";
  const zoneLabel = zone ? zone.label : "—";
  const zoneColor = zone ? zone.color : "#6B7280";
  const trendArrow = trend ? trend.arrow : "";
  const trendLabel = trend ? trend.label : "First week";

  // Score zone explanation
  let zoneExplanation = "";
  if (avgScore !== null) {
    if (avgScore < 60) {
      zoneExplanation = `${childName} had a tough week. The system is adjusting to find the right level.`;
    } else if (avgScore < 70) {
      zoneExplanation = `${childName} is close to the growth zone. Building momentum.`;
    } else if (avgScore < 85) {
      zoneExplanation = `${childName} is in the sweet spot — challenged but succeeding.`;
    } else {
      zoneExplanation = `${childName} is cruising! A level-up may be coming.`;
    }
  }

  // Level change section
  let levelChangeHtml = "";
  if (levelChanges.length > 0) {
    const latest = levelChanges[levelChanges.length - 1];
    levelChangeHtml = `
      <tr><td style="padding: 16px 24px;">
        <div style="background: #EFF6FF; border-radius: 8px; padding: 12px 16px; font-size: 15px;">
          📈 <strong>Level change:</strong> L${latest.fromLevel} → L${latest.toLevel}
        </div>
      </td></tr>`;
  }

  // Articles section
  const topArticles = articleTitles.slice(0, 3);
  const extraCount = articleTitles.length - 3;
  let articlesHtml = "";
  if (topArticles.length > 0) {
    const items = topArticles.map((t) => `<li style="margin-bottom: 4px;">${escapeHtml(t)}</li>`).join("");
    const extra = extraCount > 0 ? `<li style="color: #6B7280;">and ${extraCount} more</li>` : "";
    articlesHtml = `
      <tr><td style="padding: 8px 24px 16px;">
        <p style="font-size: 13px; color: #6B7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Articles This Week</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 15px; color: #1F2937;">
          ${items}${extra}
        </ul>
      </td></tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background: #FFFFFF; border-radius: 12px; overflow: hidden; max-width: 600px; width: 100%;">

        <!-- Header -->
        <tr><td style="background: #2563EB; padding: 24px; text-align: center;">
          <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 600;">📚 ${escapeHtml(childName)}&rsquo;s Week in Reading</h1>
        </td></tr>

        <!-- Stats row -->
        <tr><td style="padding: 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="text-align: center; padding: 8px;">
                <div style="font-size: 28px; font-weight: 700; color: #1F2937;">${sessionsCount}</div>
                <div style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">Sessions</div>
              </td>
              <td width="33%" style="text-align: center; padding: 8px;">
                <div style="font-size: 28px; font-weight: 700; color: ${zoneColor};">${scoreDisplay}</div>
                <div style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">${zoneLabel}</div>
              </td>
              <td width="33%" style="text-align: center; padding: 8px;">
                <div style="font-size: 28px; font-weight: 700; color: #1F2937;">${trendArrow}</div>
                <div style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">${trendLabel}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Zone explanation -->
        ${zoneExplanation ? `<tr><td style="padding: 0 24px 16px;">
          <p style="margin: 0; font-size: 14px; color: #4B5563; line-height: 1.5;">${zoneExplanation}</p>
        </td></tr>` : ""}

        <!-- Level change -->
        ${levelChangeHtml}

        <!-- Articles -->
        ${articlesHtml}

        <!-- CTA button -->
        <tr><td style="padding: 16px 24px 24px; text-align: center;">
          <a href="${loginUrl}" style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 32px; border-radius: 8px;">
            View Full Progress →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding: 16px 24px; border-top: 1px solid #E5E7EB; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #9CA3AF;">SigmaRead — Personalized reading for every learner</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
