import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { compassAdminUrl, compassIssuer, compassKeys, verifyAdultNote, gradeFromNote, KeysUnavailable, noteKid, ProfileError, verifyProfileNote, type Jwk } from "./compass-profile";

const ISS = "https://compass.example";
const SUB = "0b5e3c1a-2f4d-4e6a-9b7c-1d2e3f4a5b6c";
const NOW = 1_800_000_000;

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid: "k1", alg: "EdDSA", use: "sig" };
const other = generateKeyPairSync("ed25519");

function note(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signed = `${enc({ alg: opts.alg ?? "EdDSA", typ: "JWT", kid: opts.kid ?? "k1" })}.${enc(claims)}`;
  return `${signed}.${sign(null, Buffer.from(signed), opts.key ?? privateKey).toString("base64url")}`;
}

const good = { iss: ISS, aud: "sigma-read", sub: SUB, iat: NOW - 10, exp: NOW + 3600, v: 1, student: { id: SUB, name: "Test Learner", grade: "5", interests: [] } };
const check = (n: string, issuer = ISS) => verifyProfileNote(n, { issuer, keys: [jwk], now: NOW });

{
  const c = check(note(good));
  assert.equal(c.sub, SUB);
  assert.equal(c.student.name, "Test Learner");
  assert.equal(check(note(good), ISS + "/").sub, SUB, "a trailing slash on the expected issuer is fine");
  assert.equal(noteKid(note(good)), "k1");
  console.log("✅ a good note");
}

{
  const refused = (n: string, why: RegExp, issuer = ISS) => assert.throws(() => check(n, issuer), (e: unknown) => e instanceof ProfileError && why.test(e.message));
  refused(note(good, { key: other.privateKey }), /bad signature/);
  refused(note(good, { kid: "k2" }), /unknown key/);
  refused(note(good, { alg: "HS256" }), /algorithm/);
  refused(note({ ...good, aud: "spell" }), /another app/);
  refused(note({ ...good, iss: "compass-app-dev" }), /issuer/);
  refused(note(good), /issuer/, "https://other.example");
  refused(note({ ...good, exp: NOW }), /expired/);
  refused(note({ ...good, sub: "lily" }), /no id/);
  refused(note({ ...good, iat: NOW - 10, exp: NOW - 10 + 72 * 3600 }), /lifetime/);
  refused(note({ ...good, iat: NOW + 3600 }), /lifetime/);
  refused(note(null as unknown as Record<string, unknown>), /unreadable/);
  refused("a.b", /signed note/);
  const [h, , s] = note(good).split(".");
  const forged = Buffer.from(JSON.stringify({ ...good, sub: "11111111-2222-3333-4444-555555555555" })).toString("base64url");
  refused(`${h}.${forged}.${s}`, /bad signature/);
  console.log("✅ bad notes are refused");
}

{
  assert.equal(compassIssuer({ COMPASS_URL: "https://c.example/" }), "https://c.example");
  assert.equal(compassIssuer({ COMPASS_URL: "https://c.example", COMPASS_ISSUER: "https://i.example" }), "https://i.example");
  assert.equal(compassIssuer({}), null);
  assert.equal(gradeFromNote("5"), 5);
  assert.equal(gradeFromNote("K"), 0);
  assert.equal(gradeFromNote(undefined), null);
  assert.equal(gradeFromNote("Pre-K"), null);
  console.log("✅ issuer and grade");
}

{
  const adult = { iss: ISS, aud: "sigma-read/admin", sub: SUB, iat: NOW - 10, exp: NOW + 110, v: 1, adult: { id: SUB, name: "An admin", email: "admin@example.org", roles: [{ school: SUB, schoolName: "A family", role: "admin" }] } };
  const checkAdult = (n: string) => verifyAdultNote(n, { issuer: ISS, keys: [jwk], now: NOW });
  assert.equal(checkAdult(note(adult)).adult.email, "admin@example.org");
  assert.throws(() => checkAdult(note({ ...good, exp: NOW + 110 })), /another app/, "a student's note never opens the admin pages");
  assert.throws(() => checkAdult(note({ ...good, aud: "sigma-read/admin", exp: NOW + 110 })), /student's note/);
  assert.throws(() => check(note(adult)), /another app/, "an adult's note never signs a student in");
  assert.throws(() => check(note({ ...adult, aud: "sigma-read", exp: NOW + 110 })), /adult's note/);
  assert.throws(() => checkAdult(note({ ...adult, exp: NOW - 10 + 48 * 3600 })), /lifetime/, "an adult's note is short-lived");
  assert.throws(() => checkAdult(note({ ...adult, adult: { id: SUB, name: "x" } })), /no adult/);
  assert.throws(() => checkAdult(note({ ...adult, adult: { ...adult.adult, email: 7 } })), /no adult/);
  assert.throws(() => checkAdult(note({ ...adult, adult: { ...adult.adult, id: "11111111-2222-3333-4444-555555555555" } })), /subject/);
  assert.throws(() => checkAdult(note({ ...adult, exp: NOW - 10 + 600 })), /lifetime/, "ten minutes is too long for an adult's note");
  assert.equal(checkAdult(note(adult)).adult.staff, undefined, "a family's admin is not staff");
  assert.equal(checkAdult(note({ ...adult, adult: { ...adult.adult, staff: true } })).adult.staff, true);
  assert.throws(() => checkAdult(note({ ...adult, adult: { ...adult.adult, staff: "true" } })), /no adult/, "staff is true or absent, never a string");
  console.log("✅ adult notes");
}

async function keyCache() {
  let calls = 0;
  let answer: () => Response = () => new Response(JSON.stringify({ keys: [jwk] }));
  globalThis.fetch = (async () => { calls++; return answer(); }) as typeof fetch;

  assert.deepEqual((await compassKeys("https://a.example", "k1")).map((k) => k.kid), ["k1"]);
  await compassKeys("https://a.example", "k1");
  assert.equal(calls, 1, "a known key is served from the cache");
  await assert.rejects(compassKeys("https://a.example", "k9"), KeysUnavailable, "an unknown key within the minute is 'unavailable', not forged");
  assert.equal(calls, 1, "and does not fetch again");

  answer = () => new Response(JSON.stringify({ keys: "nope" }));
  await assert.rejects(compassKeys("https://b.example"), /no keys published/, "a page with no key list is not cached as keys");
  assert.equal(calls, 2);
  // Two students at once on a cold instance: one fetch, both served
  calls = 0;
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  globalThis.fetch = (async () => { calls++; await gate; return new Response(JSON.stringify({ keys: [jwk] })); }) as typeof fetch;
  const both = Promise.all([compassKeys("https://c.example", "k1"), compassKeys("https://c.example", "k1")]);
  release();
  assert.deepEqual((await both).map((ks) => ks.length), [1, 1]);
  assert.equal(calls, 1, "the second caller joins the first fetch");
  console.log("✅ key cache");
}
keyCache().catch((e) => { console.error(e); process.exit(1); });

{
  assert.equal(compassAdminUrl({ COMPASS_URL: "https://compass.example.org/" }), "https://compass.example.org/admin/");
  assert.equal(compassAdminUrl({}), null, "no Compass address: sign-out falls back to the page that says to open from Compass");
  console.log("✅ where the admin pages' sign-out leads");
}
