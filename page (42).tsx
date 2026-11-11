import Link from "next/link";
import { verifyPaystackReference } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Paystack sends the payer here after paying on its page. Works without being
 * signed in: the reference identifies our own payment record, and the result is
 * confirmed with Paystack before anything is unlocked.
 */
export default async function PaystackCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const ref = String(sp.reference || sp.trxref || "").slice(0, 100);
  let outcome: string = "not_found";
  let message: string | undefined;
  if (ref) {
    try {
      const r = await verifyPaystackReference(ref);
      outcome = r.outcome;
      message = r.message;
    } catch (e) {
      outcome = "error";
      message = (e as Error).message;
    }
  }
  const box =
    outcome === "paid"
      ? { cls: "border-emerald-300 bg-emerald-50 text-emerald-900", title: "Payment confirmed", text: "The material is now unlocked. Go back to the portal and open Course Materials to download it. You can close this tab." }
      : outcome === "pending"
        ? { cls: "border-amber-300 bg-amber-50 text-amber-900", title: "Payment not completed yet", text: "Paystack has not confirmed this payment. If you completed it, wait a minute and press “Check payment” on the material in the portal." }
        : outcome === "failed"
          ? { cls: "border-red-200 bg-red-50 text-red-800", title: "Payment failed", text: message || "The payment did not go through. No access was given. You can try again from the portal." }
          : { cls: "border-slate-200 bg-slate-50 text-slate-700", title: "Payment not found", text: message || "This link does not match a payment started in the portal." };
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">D.prince Learning Portal</h1>
        <div className={`mt-4 rounded-lg border p-4 text-sm ${box.cls}`}>
          <p className="font-semibold">{box.title}</p>
          <p className="mt-1">{box.text}</p>
          {ref && <p className="mt-2 font-mono text-xs opacity-75">Reference: {ref}</p>}
        </div>
        <Link href="/dashboard/materials" className="btn-primary mt-4 inline-block">Go to Course Materials</Link>
      </div>
    </main>
  );
}
