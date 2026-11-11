import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, materialPayments, paymentProofs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { detectFileType, safeFileName } from "@/lib/assignment-files";
import { bankDetails, bankReady, hasPaid, newReference, studentCanSee } from "@/lib/payments";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
const MAX_PROOF = 5 * 1024 * 1024;

/** A student reports a bank transfer; staff confirm it before the material unlocks. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return fail("Your session has ended. Please sign in again.", 401);
  if (me.role !== "student") return fail("Only students pay for materials.", 403);
  if (!bankReady(await bankDetails())) return fail("Bank transfer is not set up yet. Ask the school for the account details.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("The form could not be read. If the proof file is larger than 5 MB, please make it smaller.");
  }
  const [m] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, Number(form.get("materialId") ?? 0))).limit(1);
  if (!m || !(await studentCanSee(me, m))) return fail("That material is not available to you.", 404);
  if (m.priceKobo === 0) return fail("This material is free: just download it.");
  if (await hasPaid(me.id, m.id)) return fail("You have already paid for this material.");
  const [waiting] = await db
    .select({ id: materialPayments.id })
    .from(materialPayments)
    .where(and(eq(materialPayments.studentId, me.id), eq(materialPayments.materialId, m.id), eq(materialPayments.method, "bank_transfer"), eq(materialPayments.status, "pending")))
    .limit(1);
  if (waiting) return fail("You already reported a transfer for this material. It is waiting for the school to confirm it.");

  const payerName = String(form.get("payerName") ?? "").trim().slice(0, 150);
  const payerBank = String(form.get("payerBank") ?? "").trim().slice(0, 100);
  const transferDate = String(form.get("transferDate") ?? "").trim();
  const payerNote = String(form.get("payerNote") ?? "").trim().slice(0, 1000) || null;
  if (!payerName) return fail("Enter the name on the account the money was sent from.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate) || new Date(transferDate) > new Date(Date.now() + 86_400_000)) return fail("Enter the date of the transfer.");

  let proof: { bytes: Buffer; name: string; type: string } | null = null;
  const file = form.get("proof");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PROOF) return fail("The proof file is larger than 5 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = detectFileType(file.name, bytes, ["pdf", "jpg", "png"]);
    if (!type) return fail("The proof must be a PDF, JPG or PNG file (for example a screenshot of the transfer receipt).");
    proof = { bytes, name: safeFileName(file.name), type };
  }

  const [p] = await db
    .insert(materialPayments)
    .values({ materialId: m.id, studentId: me.id, method: "bank_transfer", amountKobo: m.priceKobo, reference: newReference(m.id, me.id), payerName, payerBank: payerBank || null, transferDate, payerNote, proofFileName: proof?.name ?? null, proofType: proof?.type ?? null })
    .returning({ id: materialPayments.id, reference: materialPayments.reference });
  if (proof) await db.insert(paymentProofs).values({ paymentId: p.id, data: proof.bytes });
  return NextResponse.json({ ok: true, reference: p.reference });
}
