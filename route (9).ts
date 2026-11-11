import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterialFiles, courseMaterials } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DOC_MIME, type DocType } from "@/lib/assignment-files";
import { hasPaid, studentCanSee } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Staff / Super Admin: always. Students: if the material is for them AND (free OR paid). */
export async function GET(_req: Request, ctx: RouteContext<"/api/materials/[id]/file">) {
  const me = await getCurrentUser();
  if (!me) return new Response("Please sign in again.", { status: 401 });
  const id = Number((await ctx.params).id);
  const [m] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, id)).limit(1);
  if (!m) return new Response("Not found.", { status: 404 });
  if (me.role === "student") {
    if (!(await studentCanSee(me, m))) return new Response("Not found.", { status: 404 });
    if (m.priceKobo > 0 && !(await hasPaid(me.id, m.id))) return new Response("Payment is required before this material can be downloaded.", { status: 402 });
  }
  const [f] = await db.select({ data: courseMaterialFiles.data }).from(courseMaterialFiles).where(eq(courseMaterialFiles.materialId, id)).limit(1);
  if (!f) return new Response("The file is missing.", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": DOC_MIME[(m.fileType as DocType) in DOC_MIME ? (m.fileType as DocType) : "pdf"],
      "Content-Disposition": `attachment; filename="${m.fileName}"`,
      "Content-Length": String(f.data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
