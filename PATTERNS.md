# SigmaRead Pattern Library

Common patterns for implementing features. Sub-agents: follow these patterns exactly.

---

## API Route (Authenticated)

```typescript
// src/app/api/{resource}/route.ts
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // For student-only routes:
  if (session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Query
  const results = await db.select().from(schema.tableName)
    .where(eq(schema.tableName.studentId, session.userId));

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // Validate body fields here

  const [result] = await db.insert(schema.tableName).values({
    // fields
  }).returning();

  return NextResponse.json(result);
}
```

**Rules:**
- Always `export const dynamic = "force-dynamic"` for authenticated routes
- Always check session first, return 401 if missing
- Check role if route is role-specific (student vs guide)
- Use `@/lib/db` and `@/lib/auth` imports
- Return JSON with appropriate status codes

---

## API Route (with AI / Anthropic)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // Uses ANTHROPIC_API_KEY env var

// For conversations (high quality): model = "claude-opus-4-6"
// For planning/classification: model = "claude-sonnet-4-5-20250514"
const response = await anthropic.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [...],
  system: "System prompt here",
});

const text = response.content[0].type === "text" ? response.content[0].text : "";
```

**Rules:**
- Conversations with students use Opus 4.6
- Planning, classification, article generation use Sonnet 4.5
- Always set max_tokens explicitly
- Parse response safely (check content[0].type)

---

## DB Schema Addition

```typescript
// 1. Add to src/lib/db/schema.ts
export const newTable = pgTable("new_table", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id),
  // fields...
  createdAt: timestamp("created_at").defaultNow(),
});

// 2. Generate migration
// npx drizzle-kit generate

// 3. Push to DB
// npx drizzle-kit push
```

**Rules:**
- All tables have `id` (serial) and `createdAt` (timestamp, defaultNow)
- Foreign keys use `.references(() => parentTable.id)`
- Run `drizzle-kit push` for dev, migrations for prod
- DB connection: `DATABASE_URL` env var (Neon Postgres)

---

## Page Component (Student)

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StudentPageName() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/resource")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-[var(--muted)]">Loading…</div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">SigmaRead</span>
        <span className="text-sm text-[var(--muted)]">{studentName}</span>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Page content */}
      </main>
    </div>
  );
}
```

**Rules:**
- Student pages: sticky top bar (SigmaRead + name), no sidebar
- Content centered with max-w-2xl
- Loading state = centered muted text
- Use CSS variables: `--fg`, `--muted`, `--accent`, `--border`, `--surface`
- All student pages are "use client"

---

## Page Component (Guide)

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GuidePageName() {
  const [data, setData] = useState(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/guide/resource")
      .then(r => r.json())
      .then(setData);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 border-r border-[var(--border)] p-4 flex flex-col">
        <h1 className="text-lg font-semibold mb-6">SigmaRead</h1>
        <nav className="flex-1 space-y-1">
          <a href="/guide" className="block px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface)]">
            Home
          </a>
        </nav>
        <div className="pt-4 border-t border-[var(--border)]">
          <p className="text-sm font-medium">{guideName}</p>
          <button className="text-xs text-[var(--muted)] hover:text-[var(--danger)]">Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="max-w-5xl">
          {/* Page content */}
        </div>
      </main>
    </div>
  );
}
```

**Rules:**
- Guide pages: sidebar (w-60) + main content
- Sign out + name at bottom of sidebar
- Content area max-w-5xl
- Guide routes: `/api/guide/*`

---

## Article Card

```tsx
<div className="bg-white rounded-xl border border-[var(--border)] p-5 hover:shadow-sm transition min-h-[120px]">
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
      {category}
    </span>
    <span className="text-xs text-[var(--muted)]">{readingTime} min</span>
  </div>
  <h3 className="font-semibold text-[15px] line-clamp-1 mb-1">{title}</h3>
  <p className="text-sm text-[var(--muted)] line-clamp-2">{summary}</p>
</div>
```

**Category colors:**
- News: `bg-blue-50 text-blue-600`
- For You: `bg-violet-50 text-violet-600`
- Explore: `bg-green-50 text-green-600`

---

## Toast / Feedback

```tsx
// Show a temporary feedback message
const [toast, setToast] = useState("");

function showToast(message: string) {
  setToast(message);
  setTimeout(() => setToast(""), 2500);
}

// In JSX:
{toast && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--fg)] text-white text-sm px-4 py-2 rounded-full animate-fade-in z-50">
    {toast}
  </div>
)}
```

---

## Self-Assessment Buttons

```tsx
const options = [
  { label: "I got it", value: 4, color: "bg-green-500" },
  { label: "Mostly got it", value: 3, color: "bg-blue-500" },
  { label: "Kind of", value: 2, color: "bg-amber-500" },
  { label: "Not really", value: 1, color: "bg-red-400" },
];

// Render as full-width stacked buttons:
{options.map(opt => (
  <button
    key={opt.value}
    onClick={() => handleAssess(opt.value)}
    className={`w-full py-3 ${opt.color} text-white font-medium rounded-xl text-[15px]`}
  >
    {opt.label}
  </button>
))}
```

---

## Cache Script

```typescript
// scripts/script-name.ts
// Run with: DATABASE_URL="..." npx tsx scripts/script-name.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Do work
  const rows = await sql`SELECT * FROM table_name`;
  console.log(`Found ${rows.length} rows`);
}

main().catch(console.error);
```

**Rules:**
- Scripts use `@neondatabase/serverless` directly (not Drizzle)
- Require `DATABASE_URL` env var
- Log progress to console
- Run with `npx tsx scripts/script-name.ts`

---

## Git Commit Convention

```
<short description>

- Bullet point details
- Another detail
```

- Use `wvaughan@gmail.com` as git author (Vercel team requirement)
- Push to `main` branch on `sigmaschools/sigma-reader`
- Deploy with `npx vercel --prod`

---

## File Organization

```
src/
  app/
    api/          # API routes
    guide/        # Guide pages
    student/      # Student pages
    login/        # Auth pages
  lib/
    auth.ts       # Session management
    db/
      index.ts    # DB connection
      schema.ts   # Drizzle schema
    prompts.ts    # AI prompt templates
scripts/          # One-off scripts (cache, seed, etc.)
docs/             # Product docs
  product-requirements.md  # Authoritative PRD
  product-boundary.md      # What SigmaRead is/isn't
  testing/                 # Test scenarios, personas
  research/                # Learning science, etc.
```
