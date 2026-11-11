import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, materialPayments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hasPaid, initializePaystack, newReference, paystackKeys, requestOrigin, studentCanSee } from "@/lib/payments";
import { logEvent } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/** Starts (or reuses) a Paystack payment for one material. The amount always comes from the database. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return fail("Your session has ended. Please sign in again.", 401);
  if (me.role !== "student") return fail("Only students pay for materials.", 403);
  const { materialId } = (await req.json().catch(() => ({}))) as { materialId?: number };
  const [m] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, Number(materialId))).limit(1);
  if (!m || !(await studentCanSee(me, m))) return fail("That material is not available to you.", 404);
  if (m.priceKobo === 0) return fail("This material is free: just download it.");
  if (await hasPaid(me.id, m.id)) return fail("You have already paid for this material.");
  if (!(await paystackKeys()).secret) return fail("Paystack is not set up yet. Use bank transfer, or ask the school to add the Paystack keys.");

  // Reuse a recent unfinished attempt for the same price, so double clicks do not create many.
  const [recent] = await db
    .select()
    .from(materialPayments)
    .where(and(eq(materialPayments.studentId, me.id), eq(materialPayments.materialId, m.id), eq(materialPayments.method, "paystack"), eq(materialPayments.status, "pending"), eq(materialPayments.amountKobo, m.priceKobo), gt(materialPayments.createdAt, new Date(Date.now() - 20 * 60_000))))
    .orderBy(desc(materialPayments.createdAt))
    .limit(1);
  if (recent?.paystackAccessCode) {
    return NextResponse.json({ ok: true, reference: recent.reference, accessCode: recent.paystackAccessCode, authorizationUrl: recent.paystackAuthorizationUrl });
  }

  const reference = newReference(m.id, me.id);
  try {
    const init = await initializePaystack({
      email: me.email,
      amountKobo: m.priceKobo,
      reference,
      callbackUrl: `${requestOrigin(req)}/payments/paystack/callback`,
      metadata: { material_id: m.id, student_id: me.id, material_title: m.title },
    });
    await db.insert(materialPayments).values({
      materialId: m.id, studentId: me.id, method: "paystack", amountKobo: m.priceKobo, reference,
      paystackAccessCode: init.access_code, paystackAuthorizationUrl: init.authorization_url,
    });
    return NextResponse.json({ ok: true, reference, accessCode: init.access_code, authorizationUrl: init.authorization_url });
  } catch (e) {
    logEvent("payment-error", { message: (e as Error).message, stage: "paystack-init" });
    return fail(`Paystack could not start the payment: ${(e as Error).message}`, 502);
  }
}
