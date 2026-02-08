# SigmaRead Admin Interface Spec

*Date: February 8, 2026*
*Status: Approved for implementation*

---

## Overview

Third role (`admin`) in SigmaRead alongside `student` and `guide`. Admin has full visibility across all guides, students, content, and system health. Same codebase, no separate app.

## Authentication

- New `admins` table (id, name, email, password_hash, created_at)
- Login route already supports `student` and `guide` — add `admin` role check
- Auth cookie includes `role: "admin"`
- Route group: `/admin/*`
- First admin: Wayne (wayne@sigmaschool.us / sigma2026)

## Pages

### 1. Admin Dashboard (`/admin`)

**Top-level overview of the entire system.**

Summary cards:
- Total students (active / total)
- Total guides
- Total sessions (today / this week / all time)
- Articles in cache (by level)
- Morning batch status (last run, articles generated, any errors)

Alerts (auto-generated):
- "Morning batch failed" or "Morning batch hasn't run today"
- "3 students haven't read in 7+ days"
- "Article cache low for L4 (only 2 remaining)"
- Guide-level alerts (guide hasn't logged in, guide has struggling students)

Quick links to all other admin pages.

### 2. All Students (`/admin/students`)

**Cross-guide student management.**

Table view with columns:
- Name, Username, Guide, Grade, Reading Level, Age
- Sessions (this week / total), Avg Score, Status badge
- Last active date

Features:
- Search/filter by name, guide, level, status
- Sort by any column
- Click → student detail (reuse guide's student detail page + insights)
- Bulk actions: reassign guide, adjust reading level, reset data

### 3. All Guides (`/admin/guides`)

**Guide management.**

Table view:
- Name, Email, Student count, Active students this week
- Total sessions across their students
- Last login

Features:
- Add new guide (name, email, password)
- Edit guide details
- View guide's student list (link to `/admin/students?guide=X`)

### 4. Content Management (`/admin/content`)

**Article cache browser and quality control.**

Article cache table:
- Title, Topic, Level, Category, Generated date, Source
- Word count, Base article ID (if adaptation)
- Preview button (renders article in modal)

Features:
- Filter by level, category, date
- Search by title/topic
- Delete individual articles from cache
- Flag article as inappropriate (removes from all student feeds)
- "Regenerate" button — generates a replacement article at the same level/topic
- View article distribution: how many per level, category breakdown
- Manual article generation: specify topic + level + category → generate via Opus

### 5. Pipeline Monitor (`/admin/pipeline`)

**Morning batch health and history.**

Current status:
- Last run timestamp
- Articles generated (base + adaptations)
- Students served
- Any errors/failures
- Next scheduled run

Run history (last 30 days):
- Date, articles generated, duration, errors
- Expandable: see which topics were generated

Manual controls:
- "Run batch now" button (triggers the morning batch immediately)
- "Fill student buffers" (re-serve from existing cache without generating new)
- "Check cache levels" (shows per-level cache counts)

### 6. System Metrics (`/admin/metrics`)

**Cost and usage tracking.**

API costs (estimated):
- Conversations: count × avg tokens × cost per token (Opus)
- Article generation: base articles × Opus + adaptations × Sonnet
- Onboarding: count × Sonnet
- Reports: count × Opus
- Daily / weekly / monthly totals

Usage:
- Sessions per day (chart)
- Active students per day
- Articles served per day
- Conversation styles distribution
- Avg score by level (is our calibration working?)
- Self-assessment accuracy (system-wide)

### 7. Impersonation (`/admin/impersonate`)

**See the app as any student or guide.**

- Select a student → opens their home page in a new tab (uses their session, read-only mode)
- Select a guide → opens their dashboard
- Clear impersonation banner at top: "Viewing as [Name] — Exit"
- Read-only: can view but not perform actions (no reading sessions, no conversations)

Actually, simpler v1: just a "Login as" button that sets the auth cookie to that user. Admin can switch back via `/admin`.

## Database Changes

```sql
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/admin/dashboard` | GET | System overview stats + alerts |
| `/api/admin/students` | GET | All students across all guides |
| `/api/admin/guides` | GET | All guides |
| `/api/admin/guides` | POST | Create new guide |
| `/api/admin/guides/[id]` | PATCH | Update guide |
| `/api/admin/content` | GET | Article cache browser |
| `/api/admin/content/[id]` | DELETE | Remove article from cache |
| `/api/admin/content/generate` | POST | Manual article generation |
| `/api/admin/pipeline` | GET | Batch run history + status |
| `/api/admin/pipeline/run` | POST | Trigger manual batch run |
| `/api/admin/pipeline/fill` | POST | Fill student buffers from cache |
| `/api/admin/metrics` | GET | Cost and usage data |
| `/api/admin/impersonate` | POST | Switch auth to target user |

## Auth Changes

Update `/api/auth/login` to check `admins` table when guide/student lookup fails.
Update `/api/auth/me` to return `role: "admin"`.
Update login page to route admin to `/admin`.

## Navigation

Admin sidebar:
- 🏠 Dashboard
- 👥 Students
- 👨‍🏫 Guides
- 📄 Content
- ⚙️ Pipeline
- 📊 Metrics
- 👤 Sign out

## Implementation Order

1. DB + Auth (admin table, login flow, route protection)
2. Dashboard (stats + alerts)
3. Students page (cross-guide table)
4. Guides page (CRUD)
5. Content management (cache browser + preview)
6. Pipeline monitor (status + manual run)
7. Metrics (cost estimates + usage charts)
8. Impersonation (login-as)

## Design

- Same design language as guide dashboard (clean, minimal, functional)
- Dark sidebar like guide but with admin-specific nav
- Tables with sort/filter for data-heavy pages
- Modals for previews and confirmations
- No external charting library — SVG charts like the score trendline
