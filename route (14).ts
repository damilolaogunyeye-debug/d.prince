import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materialPayments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { verifyPaystackReference } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Checks a Paystack payment with Paystack itself. Students may check only their own. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const { reference } = (await req.json().catch(() => ({}))) as { reference?: string };
  const ref = String(reference ?? "").slice(0, 100);
  const [p] = await db.select({ studentId: materialPayments.studentId }).from(materialPayments).where(eq(materialPayments.reference, ref)).limit(1);
  if (!p || (me.role === "student" && p.studentId !== me.id)) return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
  try {
    const r = await verifyPaystackReference(ref);
    return NextResponse.json({ ok: true, outcome: r.outcome, message: r.message }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Could not reach Paystack: ${(e as Error).message}` }, { status: 502 });
  }
}
