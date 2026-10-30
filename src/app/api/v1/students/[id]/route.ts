export const dynamic = "force-dynamic";
import { apiRoute, apiError, apiJson, visibleStudent } from "@/lib/api-v1/auth";
import { studentDetail } from "@/lib/api-v1/students";

/** GET /api/v1/students/{id} — one student with level history and a 30-day trend */
export const GET = apiRoute<{ id: string }>("students:read", async (_req, client, { id }) => {
  const student = await visibleStudent(client, Number(id));
  if (!student) return apiError(404, "Student not found");
  return apiJson(await studentDetail(student));
});
