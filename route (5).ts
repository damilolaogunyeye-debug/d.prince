import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentFiles, assignments, courseRegistrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { MAX_ASSIGNMENT_BYTES, detectAssignmentType, safeFileName } from "@/lib/assignment-files";
import { currentSessionName } from "@/lib/queries";
import { logEvent } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/** A student uploads an assignment (PDF or DOCX, up to 8 MB). Plain multipart POST: no special headers needed. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return fail("Your session has ended. Please sign in again.", 401);
  if (me.role !== "student") return fail("Only students can upload assignments.", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("The upload could not be read. If the file is larger than 8 MB, please make it smaller.");
  }
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const note = String(form.get("note") ?? "").trim().slice(0, 2000) || null;
  const courseIdRaw = Number(form.get("courseId") ?? 0);
  const file = form.get("file");

  if (!title) return fail("Give the assignment a title.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a PDF or Word (.docx) file to upload.");
  if (file.size > MAX_ASSIGNMENT_BYTES) return fail("The file is larger than 8 MB. Please upload a smaller file.");

  let courseId: number | null = null;
  if (courseIdRaw) {
    // Only a course the student is approved for.
    const [reg] = await db
      .select({ id: courseRegistrations.id })
      .from(courseRegistrations)
      .where(and(eq(courseRegistrations.studentId, me.id), eq(courseRegistrations.courseId, courseIdRaw), eq(courseRegistrations.status, "approved")))
      .limit(1);
    if (!reg) return fail("You can only submit for a course that has been approved for you.");
    courseId = courseIdRaw;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectAssignmentType(file.name, bytes);
  if (!type) return fail("Only PDF (.pdf) and Word (.docx) files are accepted, and the file must really be in that format. Old .doc files: save as .docx first.");

  try {
    const [row] = await db
      .insert(assignments)
      .values({ studentId: me.id, courseId, title, note, session: await currentSessionName(), fileName: safeFileName(file.name), fileType: type, fileSize: bytes.length })
      .returning({ id: assignments.id });
    try {
      await db.insert(assignmentFiles).values({ assignmentId: row.id, data: bytes });
    } catch (e) {
      await db.delete(assignments).where(eq(assignments.id, row.id)); // no record without its file
      throw e;
    }
    return NextResponse.json({ ok: true, id: row.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logEvent("server-error", { name: (e as Error).name, message: (e as Error).message, path: "/api/assignments" });
    return fail("The assignment could not be saved. Please try again.", 500);
  }
}
