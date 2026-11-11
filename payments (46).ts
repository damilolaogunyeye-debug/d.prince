import "server-only";
import { randomBytes } from "crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, localDb } from "@/db";
import { courseMaterials, courseRegistrations, materialPayments, schoolSettings, type User } from "@/db/schema";

/* ---------------- Money ---------------- */
export const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "1,500.50" -> 150050 kobo. null when not a valid amount. */
export function parseNaira(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
export const MIN_PRICE_KOBO = 100 * 100; // ₦100: smallest paid price
export const MAX_PRICE_KOBO = 10_000_000 * 100;

/* ---------------- Paystack keys ----------------
 * Read from the environment (PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY) if set,
 * otherwise from the portal's server-side settings (local database), where the
 * Super Admin saves them. The secret key is never sent to the browser. */
async function setting(key: string): Promise<string | null> {
  try {
    const r = await localDb().execute(sql`select value from portal_settings where key = ${key}`);
    return (r.rows[0] as { value?: string } | undefined)?.value ?? null;
  } catch {
    return null;
  }
}
export async function paystackKeys() {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim() || (await setting("paystack_secret_key"));
  const pub = process.env.PAYSTACK_PUBLIC_KEY?.trim() || (await setting("paystack_public_key"));
  return { secret, pub, testMode: Boolean(secret?.startsWith("sk_test_")) };
}
export async function savePaystackKeys(secret: string | null, pub: string | null) {
  for (const [k, v] of [["paystack_secret_key", secret], ["paystack_public_key", pub]] as const) {
    if (!v) continue;
    await localDb().execute(sql`insert into portal_settings (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value, updated_at = now()`);
  }
}
export const maskKey = (k: string | null) => (k ? `${k.slice(0, 8)}…${k.slice(-4)}` : "not set");

async function paystack<T>(path: string, init?: RequestInit, secretOverride?: string): Promise<{ status: boolean; message: string; data: T }> {
  const secret = secretOverride ?? (await paystackKeys()).secret;
  if (!secret) throw new Error("Paystack is not set up yet. The Super Admin adds the keys under Payments.");
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({ status: false, message: `Paystack answered HTTP ${res.status}` }))) as { status: boolean; message: string; data: T };
  return body;
}
export async function testPaystackSecret(secret: string) {
  const r = await paystack<unknown>("/transaction?perPage=1", undefined, secret).catch((e: Error) => ({ status: false, message: e.message, data: null }));
  return r.status ? null : r.message || "Paystack did not accept this secret key.";
}

/* ---------------- Bank account for transfers (kept with the school's data) ---------------- */
export type BankDetails = { bankName: string; accountNumber: string; accountName: string; instructions: string };
const BANK_KEYS = { bankName: "bank_name", accountNumber: "bank_account_number", accountName: "bank_account_name", instructions: "bank_instructions" } as const;
export async function bankDetails(): Promise<BankDetails> {
  const rows = await db.select().from(schoolSettings);
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return { bankName: get(BANK_KEYS.bankName), accountNumber: get(BANK_KEYS.accountNumber), accountName: get(BANK_KEYS.accountName), instructions: get(BANK_KEYS.instructions) };
}
export async function saveBankDetails(d: BankDetails) {
  for (const [field, key] of Object.entries(BANK_KEYS)) {
    const value = d[field as keyof BankDetails];
    await db.insert(schoolSettings).values({ key, value }).onConflictDoUpdate({ target: schoolSettings.key, set: { value, updatedAt: new Date() } });
  }
}
export const bankReady = (d: BankDetails) => Boolean(d.bankName && d.accountNumber && d.accountName);

/* ---------------- Access ---------------- */
export type Material = typeof courseMaterials.$inferSelect;

/** Can this student see the material at all (published, and for an approved course or for everyone)? */
export async function studentCanSee(student: User, m: Material) {
  if (!m.isPublished) return false;
  if (!m.courseId) return true;
  const [reg] = await db
    .select({ id: courseRegistrations.id })
    .from(courseRegistrations)
    .where(and(eq(courseRegistrations.studentId, student.id), eq(courseRegistrations.courseId, m.courseId), eq(courseRegistrations.status, "approved")))
    .limit(1);
  return Boolean(reg);
}

export async function hasPaid(studentId: number, materialId: number) {
  const [p] = await db
    .select({ id: materialPayments.id })
    .from(materialPayments)
    .where(and(eq(materialPayments.studentId, studentId), eq(materialPayments.materialId, materialId), eq(materialPayments.status, "paid")))
    .limit(1);
  return Boolean(p);
}

export const newReference = (materialId: number, studentId: number) => `DPL-${materialId}-${studentId}-${randomBytes(5).toString("hex")}`;

/** Marks a payment paid. Safe to call twice; the database allows only one paid row per student and material. */
export async function markPaid(paymentId: number, extra: Partial<typeof materialPayments.$inferInsert> = {}) {
  try {
    await db.update(materialPayments).set({ status: "paid", paidAt: new Date(), ...extra }).where(and(eq(materialPayments.id, paymentId), ne(materialPayments.status, "paid")));
    return true;
  } catch (e) {
    if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505") return false; // already paid another way
    throw e;
  }
}

/* ---------------- Paystack transactions ---------------- */
export async function initializePaystack(opts: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  const r = await paystack<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email: opts.email, amount: opts.amountKobo, currency: "NGN", reference: opts.reference, callback_url: opts.callbackUrl, metadata: opts.metadata }),
  });
  if (!r.status) throw new Error(r.message || "Paystack could not start the payment.");
  return r.data;
}

export type VerifyOutcome = "paid" | "pending" | "failed" | "not_found";

/**
 * Asks Paystack about a reference we created and updates our record. The payment
 * counts only if Paystack says success AND the amount and currency match exactly.
 */
export async function verifyPaystackReference(reference: string): Promise<{ outcome: VerifyOutcome; payment?: typeof materialPayments.$inferSelect; message?: string }> {
  const [p] = await db.select().from(materialPayments).where(and(eq(materialPayments.reference, reference), eq(materialPayments.method, "paystack"))).limit(1);
  if (!p) return { outcome: "not_found" };
  if (p.status === "paid") return { outcome: "paid", payment: p };
  const r = await paystack<{ status: string; amount: number; currency: string; reference: string; gateway_response?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!r.status || !r.data) return { outcome: "pending", payment: p, message: r.message };
  const d = r.data;
  if (d.status === "success") {
    if (d.reference !== p.reference || d.amount !== p.amountKobo || d.currency !== "NGN") {
      await db.update(materialPayments).set({ status: "failed", reviewNote: `Paystack amount/currency mismatch: ${d.amount} ${d.currency}` }).where(eq(materialPayments.id, p.id));
      return { outcome: "failed", payment: p, message: "The amount paid does not match the price. Contact the school." };
    }
    const ok = await markPaid(p.id);
    if (!ok) await db.update(materialPayments).set({ status: "failed", reviewNote: "Duplicate: this material was already paid for." }).where(eq(materialPayments.id, p.id));
    return { outcome: "paid", payment: p };
  }
  if (d.status === "failed" || d.status === "reversed") {
    await db.update(materialPayments).set({ status: "failed", reviewNote: d.gateway_response ?? d.status }).where(eq(materialPayments.id, p.id));
    return { outcome: "failed", payment: p, message: d.gateway_response || "The payment failed." };
  }
  return { outcome: "pending", payment: p }; // abandoned / ongoing: not completed yet
}

/** The public address of the portal for this request (used for Paystack's return link). */
export function requestOrigin(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
