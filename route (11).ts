import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materialPayments, paymentProofs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DOC_MIME, type DocType } from "@/lib/assignment-files";

export const dynamic = "force-dynamic";

/** Transfer proof: staff / Super Admin, or the student who sent it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/payments/[id]/proof">) {
  const me = await getCurrentUser();
  if (!me) return new Response("Please sign in again.", { status: 401 });
  const id = Number((await ctx.params).id);
  const [p] = await db.select().from(materialPayments).where(eq(materialPayments.id, id)).limit(1);
  if (!p || !p.proofFileName || (me.role === "student" && p.studentId !== me.id)) return new Response("Not found.", { status: 404 });
  const [f] = await db.select({ data: paymentProofs.data }).from(paymentProofs).where(eq(paymentProofs.paymentId, id)).limit(1);
  if (!f) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": DOC_MIME[(p.proofType as DocType) ?? "pdf"], "Content-Disposition": `attachment; filename="${p.proofFileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
