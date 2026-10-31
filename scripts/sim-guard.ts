/**
 * Guard for scripts that write fake students/sessions (seed-students, simulate-students).
 * Production has at least one admin login; the sim-test branch has none. Refuse to write
 * to a database with admins unless SIM_ALLOW_ADMINS=1 is set for a dev DB that has them.
 */
export async function assertNotProduction(sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>) {
  if (process.env.SIM_ALLOW_ADMINS === "1") return;
  const [row] = await sql`SELECT count(*)::int AS n FROM admins`;
  if (Number(row?.n) > 0) {
    console.error("Refusing to run: this database has admin logins, so it looks like production.");
    console.error("Point DATABASE_URL at the sim-test branch, or set SIM_ALLOW_ADMINS=1 for a dev database.");
    process.exit(1);
  }
}
