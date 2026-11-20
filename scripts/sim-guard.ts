/**
 * Guard for scripts that write fake students/sessions (seed-students, simulate-students).
 * Production's students come from Compass, so they carry a Compass learner id (external_id);
 * the sim-test branch's fake students have none. Refuse to write to a database with
 * Compass-linked students unless SIM_ALLOW_ADMINS=1 is set for a dev DB that has them.
 * (The variable keeps its old name: the guard used to count rows in the dropped admins table.)
 */
export async function assertNotProduction(sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>) {
  if (process.env.SIM_ALLOW_ADMINS === "1") return;
  const [row] = await sql`SELECT count(*)::int AS n FROM students WHERE external_id IS NOT NULL`;
  if (Number(row?.n) > 0) {
    console.error("Refusing to run: this database has students linked to Compass, so it looks like production.");
    console.error("Point DATABASE_URL at the sim-test branch, or set SIM_ALLOW_ADMINS=1 for a dev database.");
    process.exit(1);
  }
}
