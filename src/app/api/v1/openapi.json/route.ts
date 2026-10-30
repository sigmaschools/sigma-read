import { NextResponse } from "next/server";

// Static description of /api/v1, so the Compass team can generate a client. Contains no data.
const page = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } };
const cursor = { name: "cursor", in: "query", schema: { type: "string" }, description: "nextCursor from the previous page" };
const idParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "integer" } });
const errors = {
  "401": { description: "Missing, invalid or revoked key" },
  "403": { description: "Key lacks the scope" },
  "404": { description: "Not found, or not visible to this key" },
  "429": { description: "More than 120 requests in a minute" },
};

const Student = {
  type: "object",
  properties: {
    id: { type: "integer" },
    externalId: { type: "string", nullable: true, description: "Compass ID" },
    name: { type: "string" },
    gradeLevel: { type: "integer", nullable: true },
    readingLevel: { type: "integer", nullable: true, description: "1–6, null until assessed" },
    onboardingComplete: { type: "boolean" },
    guide: { type: "object", properties: { id: { type: "integer" }, externalId: { type: "string", nullable: true } } },
    lastActiveAt: { type: "string", format: "date-time", nullable: true },
    sessionsThisWeek: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
  },
};

const spec = {
  openapi: "3.0.3",
  info: { title: "SigmaRead API", version: "1.0.0", description: "Read-only API for Compass. Authenticate with `Authorization: Bearer <key>`; keys are issued by a SigmaRead admin. Every call is logged." },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: { Student },
  },
  security: [{ bearer: [] }],
  paths: {
    "/students": {
      get: {
        summary: "List students (scope students:read)", parameters: [page, cursor],
        responses: { "200": { description: "A page of students", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Student" } }, nextCursor: { type: "string", nullable: true } } } } } }, ...errors },
      },
    },
    "/students/{id}": {
      get: { summary: "One student with level history and a 30-day trend (scope students:read)", parameters: [idParam("id")], responses: { "200": { description: "Student" }, ...errors } },
    },
    "/students/by-external/{externalId}": {
      get: { summary: "Look up a student by Compass ID (scope students:read)", parameters: [{ name: "externalId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Student" }, ...errors } },
    },
    "/students/{id}/sessions": {
      get: {
        summary: "Completed sessions, newest first (scope reports:read)",
        parameters: [idParam("id"), { name: "since", in: "query", schema: { type: "string", format: "date-time" } }, page, cursor],
        responses: { "200": { description: "A page of sessions with score, rating, skills and self-assessment" }, ...errors },
      },
    },
    "/sessions/{id}": {
      get: { summary: "One session's full report (scope reports:read); transcript included with transcripts:read", parameters: [idParam("id")], responses: { "200": { description: "Session" }, ...errors } },
    },
  },
};

export function GET() {
  return NextResponse.json(spec);
}
