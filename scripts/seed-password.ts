/**
 * The password a seed script gives the accounts it creates.
 * It comes from SEED_PASSWORD, never from the repository: a password written in a
 * script or doc is readable by everyone with repo access, forever (git history).
 */
export function seedPassword(): string {
  const p = process.env.SEED_PASSWORD;
  if (!p || p.length < 12) {
    throw new Error("Set SEED_PASSWORD (12+ characters) to the password the seeded accounts should get. Never commit it.");
  }
  return p;
}
