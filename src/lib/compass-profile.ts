/**
 * The student's profile note from Compass (app contract section 1.1).
 *
 * Compass opens SigmaRead with `#compass_profile=<note>`: a JWT signed with Ed25519 by the
 * Compass server. The server checks it here before it signs a student in, against the keys
 * Compass publishes at `<COMPASS_URL>/.well-known/jwks.json`. No library: Node's crypto
 * verifies Ed25519 from a JSON Web Key directly.
 */
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/** Our slug in the Compass registry: a note for any other app is refused */
export const COMPASS_APP_SLUG = "sigma-read";

export interface CompassInterestNote {
  topic: string;
  label: string;
  words?: string[];
}

export interface CompassStudentNote {
  id: string;
  name: string;
  grade?: string;
  interests?: CompassInterestNote[];
}

export interface CompassProfileClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  v: number;
  student: CompassStudentNote;
}

/** An adult opening SigmaRead's admin pages from Compass Admin (app contract 1.2) */
export interface CompassAdultNote {
  id: string;
  name: string;
  email?: string;
  roles: { school: string; schoolName: string; role: string }[];
}

export interface CompassAdultClaims extends Omit<CompassProfileClaims, "student"> {
  adult: CompassAdultNote;
}

/** An adult's note is good for two minutes; a little slack for clocks */
export const MAX_ADULT_LIFETIME_S = 10 * 60;

export interface Jwk extends JsonWebKey {
  kid?: string;
}

export class ProfileError extends Error {}

/** The longest a note may be good for: Compass signs them for 48 hours, plus an hour of slack */
export const MAX_LIFETIME_S = 49 * 3600;

const b64 = (s: string) => Buffer.from(s, "base64url");

/** The Compass server we trust, without a trailing slash; null when SigmaRead is not set up for Compass */
export function compassIssuer(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.COMPASS_ISSUER || env.COMPASS_URL || "").trim().replace(/\/+$/, "");
  return url || null;
}

/**
 * Checks a note and returns its claims, or throws ProfileError.
 * `keys` is the issuer's JSON Web Key Set; `now` is in seconds.
 */
export function verifyProfileNote(
  note: string,
  opts: { issuer: string; keys: Jwk[]; audience?: string; now?: number },
): CompassProfileClaims {
  const claims = verifyNote(note, opts, MAX_LIFETIME_S) as CompassProfileClaims & { adult?: unknown };
  if (claims.adult !== undefined) throw new ProfileError("an adult's note does not sign a student in");
  if (!claims.student || typeof claims.student !== "object") throw new ProfileError("no student");
  return claims;
}

/** Checks an adult's note (contract 1.2): the same signature and claims, an `adult` and no `student` */
export function verifyAdultNote(
  note: string,
  opts: { issuer: string; keys: Jwk[]; audience?: string; now?: number },
): CompassAdultClaims {
  // An adult's note is for "<slug>/admin", so it can never pass as a student's note
  const claims = verifyNote(note, { ...opts, audience: opts.audience ?? `${COMPASS_APP_SLUG}/admin` }, MAX_ADULT_LIFETIME_S) as CompassAdultClaims & { student?: unknown };
  if (claims.student !== undefined) throw new ProfileError("a student's note does not open the admin pages");
  if (!claims.adult || typeof claims.adult !== "object" || !Array.isArray(claims.adult.roles)) throw new ProfileError("no adult");
  return claims;
}

function verifyNote(
  note: string,
  opts: { issuer: string; keys: Jwk[]; audience?: string; now?: number },
  maxLifetime: number,
): { iss: string; aud: string; sub: string; iat: number; exp: number } {
  const parts = note.split(".");
  if (parts.length !== 3) throw new ProfileError("not a signed note");
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let claims: { iss: string; aud: string; sub: string; iat: number; exp: number };
  try {
    header = JSON.parse(b64(h).toString("utf8"));
    claims = JSON.parse(b64(p).toString("utf8"));
  } catch {
    throw new ProfileError("unreadable note");
  }
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") throw new ProfileError("unreadable note");
  if (header.alg !== "EdDSA") throw new ProfileError("unexpected algorithm");
  if (typeof header.kid !== "string") throw new ProfileError("unknown key");

  const jwk = opts.keys.find((k) => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!jwk) throw new ProfileError("unknown key");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
  if (!verify(null, Buffer.from(`${h}.${p}`), key, b64(s))) throw new ProfileError("bad signature");

  const issuer = opts.issuer.replace(/\/+$/, "");
  if (typeof claims.iss !== "string" || claims.iss.replace(/\/+$/, "") !== issuer) throw new ProfileError("wrong issuer");
  if (claims.aud !== (opts.audience ?? COMPASS_APP_SLUG)) throw new ProfileError("note is for another app");
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new ProfileError("note has expired");
  // Compass's notes are good for 48 hours (contract 1.1); anything longer, or signed in the future, is refused
  if (typeof claims.iat !== "number" || claims.iat > now + 300 || claims.exp - claims.iat > maxLifetime) throw new ProfileError("note lifetime out of range");
  if (typeof claims.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub)) throw new ProfileError("no id");
  return claims;
}

/**
 * Compass's keys, cached for up to an hour. A note naming a key we do not hold fetches them
 * again, but at most once a minute and one fetch at a time: the route is open to anyone, so a
 * stream of made-up key ids must not turn into a stream of calls to Compass.
 */
/** Compass's keys could not be had just now: not the note's fault */
export class KeysUnavailable extends Error {}

/** Keys held past this while Compass's key page is down are no longer trusted */
const STALE_LIMIT_MS = 24 * 3600_000;

let cache: { base: string; keys: Jwk[]; at: number } | null = null;
let lastTry = { base: "", at: 0 };
let inFlight: Promise<Jwk[]> | null = null;

export async function compassKeys(base: string, kid?: string): Promise<Jwk[]> {
  const held = cache && cache.base === base ? cache : null;
  const fresh = held && Date.now() - held.at < 3600_000;
  if (held && fresh && (!kid || held.keys.some((k) => k.kid === kid))) return held.keys;
  // A fetch already under way: wait for it rather than refuse
  if (!inFlight) {
    // At most one new try a minute, failed tries included; meanwhile what we hold still checks known
    // keys, and a key we have not seen yet is "unavailable for now", not a forged note
    if (lastTry.base === base && Date.now() - lastTry.at < 60_000) {
      if (held && Date.now() - held.at < STALE_LIMIT_MS && (!kid || held.keys.some((k) => k.kid === kid))) return held.keys;
      throw new KeysUnavailable("waiting before fetching keys again");
    }
  }
  if (!inFlight) {
    lastTry = { base, at: Date.now() };
    inFlight = (async () => {
      try {
        const res = await fetch(`${base}/.well-known/jwks.json`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new KeysUnavailable(`keys unavailable (${res.status})`);
        const body = (await res.json()) as { keys?: unknown };
        const keys = Array.isArray(body?.keys) ? (body.keys as Jwk[]).filter((k) => k && typeof k === "object") : [];
        if (keys.length === 0) throw new KeysUnavailable("no keys published");
        cache = { base, keys, at: Date.now() };
        return cache.keys;
      } catch (e) {
        // Compass's key page is down: keep using the keys we have, for a day at most
        if (held && Date.now() - held.at < STALE_LIMIT_MS && (!kid || held.keys.some((k) => k.kid === kid))) return held.keys;
        throw new KeysUnavailable(e instanceof Error ? e.message : String(e));
      }
    })().finally(() => { inFlight = null; });
  }
  const keys = await inFlight;
  // Joined someone else's fetch, and it did not bring this note's key: "try again", not "forged"
  if (kid && !keys.some((k) => k.kid === kid)) throw new KeysUnavailable(`no key ${kid} published`);
  return keys;
}

/** Where Compass publishes its keys: COMPASS_URL, without a trailing slash */
export function compassBase(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.COMPASS_URL || "").trim().replace(/\/+$/, "");
  return url || null;
}

/** The `kid` a note names, without checking anything, so the right keys can be fetched */
export function noteKid(note: string): string | undefined {
  try {
    return JSON.parse(b64(note.split(".")[0]).toString("utf8")).kid;
  } catch {
    return undefined;
  }
}

/** Compass sends grade as text ("5", "K"); SigmaRead keeps a number, K as 0 */
export function gradeFromNote(grade: string | undefined): number | null {
  if (!grade) return null;
  if (/^k$/i.test(grade.trim())) return 0;
  const n = parseInt(grade, 10);
  return Number.isFinite(n) && n >= 0 && n <= 12 ? n : null;
}
