// Regression test for scripts/check-no-credentials.sh: runs the script in a throwaway
// git repository against lines that must fail and lines that must pass.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(__dirname, "check-no-credentials.sh");

function run(files: Record<string, string>, opts: { track?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "credcheck-"));
  try {
    const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    mkdirSync(join(dir, "scripts"));
    copyFileSync(script, join(dir, "scripts/check-no-credentials.sh"));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    if (opts.track !== false) git("add", "-A");
    const r = spawnSync("bash", ["scripts/check-no-credentials.sh"], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Each of these must fail the check on its own.
const mustFail = [
  "| Role | User | Password | Notes |", // credential-check: allow
  "| Password | User |", // credential-check: allow
  "guide@example.com / hunter22", // credential-check: allow
  'const p = { password: "hunter22" };', // credential-check: allow
  'await bcrypt.hash("hunter22", 10);', // credential-check: allow
  'await bcrypt.hash(s.username + "2026", 10);', // credential-check: allow
  'const pw = u + "2026";', // credential-check: allow
  'const password = name.toLowerCase() + "2026";', // credential-check: allow
  'const password = "x" + name;', // credential-check: allow
  "password: `${u}2026`,", // credential-check: allow
  "DATABASE_URL=postgres://app:hunter22@db.example.com/main", // credential-check: allow
];
for (const line of mustFail) {
  const r = run({ "probe.ts": line + "\n" });
  assert.equal(r.status, 1, `should fail: ${line}\n${r.out}`);
}

// Prose in Markdown.
assert.equal(run({ "notes.md": "Password: hunter22\n" }).status, 1); // credential-check: allow

// These must pass.
const mustPass = [
  "const hash = await bcrypt.hash(password, 10);",
  "const hash = await bcrypt.hash(seedPassword(), 10);",
  "const p = { password: newPassword };",
  "password: string;",
  "DATABASE_URL=postgres://test:test@localhost:5432/test",
  "| Role | Username | Notes |",
  'const p = { password: "hunter22" }; // credential-check: allow',
];
const ok = run({ "probe.ts": mustPass.join("\n") + "\n" });
assert.equal(ok.status, 0, ok.out);

// An untracked copy of the script cannot exempt itself, so it refuses to run rather than pass.
const untracked = run({ "probe.ts": "nothing here\n" }, { track: false });
assert.equal(untracked.status, 2, untracked.out);

console.log("check-no-credentials: ok");
