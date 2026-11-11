"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, materialPayments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { markPaid, saveBankDetails, savePaystackKeys, testPaystackSecret } from "@/lib/payments";
import { go, str } from "./helpers";

/* ---------- Materials (staff / Super Admin) ---------- */
const backTo = (fd: FormData) => (str(fd, "back") === "/dashboard/past-questions" ? "/dashboard/past-questions" : "/dashboard/materials");
export async function toggleMaterialAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const [m] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, id)).limit(1);
  if (!m) go(backTo(formData), "Material not found.", "err");
  await db.update(courseMaterials).set({ isPublished: !m!.isPublished }).where(eq(courseMaterials.id, id));
  go(backTo(formData), `"${m!.title}" is now ${m!.isPublished ? "hidden from students" : "visible to students"}.`);
}

export async function deleteMaterialAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const [m] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, id)).limit(1);
  if (!m) go(backTo(formData), "Material not found.", "err");
  const [paid] = await db.select({ id: materialPayments.id }).from(materialPayments).where(and(eq(materialPayments.materialId, id), eq(materialPayments.status, "paid"))).limit(1);
  // Deleting would also delete the payment records students paid for.
  if (paid) go(backTo(formData), `"${m!.title}" has been paid for, so it cannot be deleted (that would erase payment records). Hide it instead.`, "err");
  await db.delete(courseMaterials).where(eq(courseMaterials.id, id));
  go(backTo(formData), `"${m!.title}" deleted.`);
}

/* ---------- Bank transfers (staff / Super Admin) ---------- */
export async function reviewTransferAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const decision = str(formData, "decision");
  const note = str(formData, "note").slice(0, 1000) || null;
  const [p] = await db.select().from(materialPayments).where(eq(materialPayments.id, id)).limit(1);
  if (!p || p.method !== "bank_transfer") go("/dashboard/payments", "Transfer not found.", "err");
  if (p!.status !== "pending") go("/dashboard/payments", "This transfer has already been dealt with.", "err");
  if (decision === "confirm") {
    const ok = await markPaid(id, { reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note });
    if (!ok) {
      await db.update(materialPayments).set({ status: "rejected", reviewedBy: me.id, reviewedAt: new Date(), reviewNote: "Already paid for by another payment." }).where(eq(materialPayments.id, id));
      go("/dashboard/payments", "The student had already paid for this material another way, so this transfer was marked as a duplicate. Refund it if the money arrived.", "err");
    }
    go("/dashboard/payments", "Transfer confirmed. The student can now download the material.");
  }
  if (decision === "reject") {
    if (!note) go("/dashboard/payments", "Write a short reason so the student knows why the transfer was rejected.", "err");
    await db.update(materialPayments).set({ status: "rejected", reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note }).where(eq(materialPayments.id, id));
    go("/dashboard/payments", "Transfer rejected. The student sees your reason.");
  }
  go("/dashboard/payments", "Choose confirm or reject.", "err");
}

/* ---------- Settings (Super Admin only) ---------- */
export async function saveBankDetailsAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const d = {
    bankName: str(formData, "bankName").slice(0, 100),
    accountNumber: str(formData, "accountNumber").replace(/\s+/g, ""),
    accountName: str(formData, "accountName").slice(0, 150),
    instructions: str(formData, "instructions").slice(0, 1000),
  };
  if (!d.bankName || !d.accountName) go("/dashboard/payments", "Enter the bank name and account name.", "err");
  if (!/^\d{10}$/.test(d.accountNumber)) go("/dashboard/payments", "A Nigerian account number has 10 digits.", "err");
  await saveBankDetails(d);
  go("/dashboard/payments", "Bank account details saved. Students now see them when paying by transfer.");
}

export async function savePaystackKeysAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const secret = str(formData, "secret");
  const pub = str(formData, "public");
  if (!secret && !pub) go("/dashboard/payments", "Enter at least one key.", "err");
  if (secret && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(secret)) go("/dashboard/payments", "The secret key starts with sk_test_ or sk_live_.", "err");
  if (pub && !/^pk_(test|live)_[A-Za-z0-9]+$/.test(pub)) go("/dashboard/payments", "The public key starts with pk_test_ or pk_live_.", "err");
  if (secret && pub && secret.slice(3, 7) !== pub.slice(3, 7)) go("/dashboard/payments", "Both keys must be test keys, or both live keys.", "err");
  if (secret) {
    const problem = await testPaystackSecret(secret);
    if (problem) go("/dashboard/payments", `Paystack rejected the secret key: ${problem}`, "err");
  }
  await savePaystackKeys(secret || null, pub || null);
  go("/dashboard/payments", `Paystack keys saved${secret.startsWith("sk_live_") ? " (LIVE: real money)" : ""}.`);
}
