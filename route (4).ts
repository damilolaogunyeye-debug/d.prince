import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentFiles, assignments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { MIME } from "@/lib/assignment-files";

export const dynamic = "force-dynamic";

/** Students may open their own uploads; staff and the Super Admin may open any. */
export async function GET(_req: Request, ctx: RouteContext<"/api/assignments/[id]/file">) {
  const me = await getCurrentUser();
  if (!me) return new Response("Please sign in again.", { status: 401 });
  const id = Number((await ctx.params).id);
  const [a] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  if (!a || (me.role === "student" && a.studentId !== me.id)) return new Response("Not found.", { status: 404 });
  const [f] = await db.select({ data: assignmentFiles.data }).from(assignmentFiles).where(eq(assignmentFiles.assignmentId, id)).limit(1);
  if (!f) return new Response("The file is missing.", { status: 404 });
  const type = a.fileType === "docx" ? "docx" : "pdf";
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": MIME[type],
      "Content-Disposition": `attachment; filename="${a.fileName}"`,
      "Content-Length": String(f.data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
