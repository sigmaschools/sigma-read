/**
 * One-time migration: normalize all student interest profiles to canonical shape.
 *
 * Run with: DATABASE_URL="..." npx tsx scripts/fix-interest-profiles.ts
 */

import { neon } from "@neondatabase/serverless";
import { normalizeInterestProfile } from "../src/lib/normalize-interests";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const students = await sql`
    SELECT id, name, interest_profile FROM students
    WHERE interest_profile IS NOT NULL
  `;

  console.log(`Found ${students.length} students with interest profiles\n`);

  let updated = 0;

  for (const student of students) {
    const raw = student.interest_profile;
    const normalized = normalizeInterestProfile(raw);

    // Check if already canonical (new flat shape)
    const isCanonical =
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Array.isArray((raw as Record<string, unknown>).interests) &&
      !("primary_interests" in (raw as Record<string, unknown>));

    if (isCanonical) {
      console.log(`  ${student.name} (id ${student.id}): already canonical — skipped`);
      continue;
    }

    console.log(`  ${student.name} (id ${student.id}):`);
    console.log(`    BEFORE: ${JSON.stringify(raw)}`);
    console.log(`    AFTER:  ${JSON.stringify(normalized)}`);

    await sql`
      UPDATE students SET interest_profile = ${JSON.stringify(normalized)}::jsonb
      WHERE id = ${student.id}
    `;
    updated++;
  }

  console.log(`\nDone. Updated ${updated} of ${students.length} profiles.`);
}

main().catch(console.error);
