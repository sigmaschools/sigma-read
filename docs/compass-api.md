# Compass API (v1)

A read-only REST API under `/api/v1/` for Compass and other service clients. It is separate from the cookie-based routes the app uses: clients authenticate with a key, not as a user.

## Keys

- An admin creates a key on **Admin → API Keys** (`/admin/api-clients`). Each key has a name, one or more scopes, and optionally a guide (the key then sees only that guide's students).
- The key (`sr_live_…`) is shown once. Only its SHA-256 hash is stored (`api_clients.key_hash`).
- Revoking is permanent. To rotate a key, create a new one, switch the client over, then revoke the old one.
- Creating and revoking keys is written to `admin_audit_log`.

Clients send `Authorization: Bearer <key>`.

| Scope | Gives |
| --- | --- |
| `students:read` | Student list and detail: name, grade, reading level, guide, last active, sessions this week, level history, 30-day score and skill trend |
| `reports:read` | Sessions and comprehension reports |
| `transcripts:read` | The conversation transcript and the report's `evidence` quotes on `/sessions/{id}` (needs `reports:read`) |

## Endpoints

| Method and path | Scope |
| --- | --- |
| `GET /api/v1/students?limit=&cursor=` | `students:read` |
| `GET /api/v1/students/{id}` | `students:read` |
| `GET /api/v1/students/by-external/{externalId}` | `students:read` |
| `GET /api/v1/students/{id}/sessions?since=&limit=&cursor=` | `reports:read` |
| `GET /api/v1/sessions/{id}` | `reports:read` (+ `transcripts:read` for the transcript and evidence) |
| `GET /api/v1/openapi.json` | none (the spec, no data) |

Lists are cursor-paginated: pass the response's `nextCursor` back as `cursor` until it is null. `limit` is 1–100 (default 50). Dates are ISO 8601 UTC. Only completed sessions are listed or returned (an in-progress session is a 404), newest started first, and each shows its latest report. `since` filters on completion time and takes a date (midnight UTC) or a datetime ending in `Z` or an offset (send `+` as `%2B`).

Every report carries `disputed: true` when a guide or admin has flagged it as wrong. The student detail's `last30Days` averages include disputed reports, the same as the guide dashboard; use the session list's `disputed` to filter them out. In a report, `comprehension` is what the student understood and `depth` is what they missed or could go further on.

## Identity

`students.external_id` and `guides.external_id` hold the Compass IDs (unique, nullable). An admin sets a student's on the student edit form ("Compass ID"). Compass can then use `/students/by-external/{externalId}` without knowing SigmaRead's ids.

## Audit and limits

Every call with a recognised key, revoked keys included, writes an `api_request_log` row (client, method, path with query, status). A key is limited to 120 calls a minute (429 with `Retry-After: 60`). Calls answered with a 429 don't count toward it (other errors do), and it is a soft limit: a burst of parallel calls can pass it slightly. The limit counts log rows, so if log writes fail (logged as `api_request_log write failed`), calls are neither recorded nor limited until they recover; the response is still returned. Responses carry `Cache-Control: no-store`.

## Not in v1

- No `updated_since` on the student list, because students have no `updated_at` column. Poll the list, or use `sessions?since=` for new activity.
- No webhooks or single sign-on yet (see the improvement proposals doc).
- There's no admin UI for guide external IDs yet.
- `api_request_log` has no retention rule yet. It needs one (for example 12 months) once real clients use the API.
