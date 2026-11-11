"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Bank = { bankName: string; accountNumber: string; accountName: string; instructions: string } | null;
type PopupCallbacks = { onSuccess?: (t: { reference: string }) => void; onCancel?: () => void; onError?: (e: { message: string }) => void };
type PaystackPopCtor = new () => { resumeTransaction: (accessCode: string, cb: PopupCallbacks) => unknown };

let scriptPromise: Promise<PaystackPopCtor> | null = null;
function loadPaystack(): Promise<PaystackPopCtor> {
  const w = window as unknown as { PaystackPop?: PaystackPopCtor };
  if (w.PaystackPop) return Promise.resolve(w.PaystackPop);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.async = true;
    s.onload = () => (w.PaystackPop ? resolve(w.PaystackPop) : reject(new Error("Paystack checkout did not load.")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Paystack checkout could not be loaded (blocked or offline)."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function MaterialPurchase(props: {
  materialId: number;
  priceLabel: string;
  paystackReady: boolean;
  bank: Bank;
  pendingTransfer: boolean;
  lastPaystackRef: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(props.lastPaystackRef);
  const [showBank, setShowBank] = useState(false);

  async function verify(reference: string) {
    setMsg({ tone: "info", text: "Checking the payment with Paystack…" });
    try {
      const res = await fetch("/api/payments/paystack/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; outcome?: string; message?: string; error?: string };
      if (d.outcome === "paid") {
        setMsg({ tone: "ok", text: "Payment confirmed. The download is unlocked." });
        router.refresh();
      } else if (d.outcome === "failed") setMsg({ tone: "err", text: d.message || "The payment failed. You were not charged for access; try again." });
      else if (d.ok) setMsg({ tone: "info", text: "Paystack has not confirmed a completed payment yet. If you just paid, wait a moment and check again." });
      else setMsg({ tone: "err", text: d.error || "Could not check the payment." });
    } catch {
      setMsg({ tone: "err", text: "The server could not be reached. Try “Check payment” again." });
    }
  }

  async function payWithPaystack() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/payments/paystack/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId: props.materialId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reference?: string; accessCode?: string; authorizationUrl?: string };
      if (!d.ok || !d.accessCode || !d.reference) {
        setMsg({ tone: "err", text: d.error || `Could not start the payment (HTTP ${res.status}).` });
        return;
      }
      setRef(d.reference);
      setFallbackUrl(d.authorizationUrl ?? null);
      const reference = d.reference;
      try {
        const Pop = await loadPaystack();
        new Pop().resumeTransaction(d.accessCode, {
          onSuccess: () => void verify(reference),
          onCancel: () => setMsg({ tone: "info", text: "Payment window closed. If you already paid, press “Check payment”." }),
          onError: (e) => setMsg({ tone: "err", text: `Paystack: ${e?.message || "could not open the checkout"}. Use “Open Paystack in a new tab” below.` }),
        });
      } catch (e) {
        setMsg({ tone: "err", text: `${(e as Error).message} Use “Open Paystack in a new tab” below.` });
      }
    } catch {
      setMsg({ tone: "err", text: "The server could not be reached. Nothing was charged; please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("materialId", String(props.materialId));
    try {
      const res = await fetch("/api/payments/bank", { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!d.ok) setMsg({ tone: "err", text: d.error || `Could not send (HTTP ${res.status}).` });
      else {
        setShowBank(false);
        setMsg({ tone: "ok", text: "Transfer reported. The download unlocks as soon as the school confirms the money has arrived." });
        router.refresh();
      }
    } catch {
      setMsg({ tone: "err", text: "The server could not be reached. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const tone = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", err: "border-red-200 bg-red-50 text-red-700", info: "border-blue-200 bg-blue-50 text-blue-900" };

  return (
    <div className="space-y-2">
      {props.pendingTransfer ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Your bank transfer is waiting for the school to confirm it.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.paystackReady && <button type="button" onClick={payWithPaystack} disabled={busy} className="btn-primary">{busy ? "Please wait…" : `Pay ${props.priceLabel} with Paystack`}</button>}
          {props.bank && <button type="button" onClick={() => setShowBank((v) => !v)} className="btn-outline">Pay by bank transfer</button>}
          {!props.paystackReady && !props.bank && <p className="text-sm text-slate-500">Payment is not set up yet. Ask the school.</p>}
        </div>
      )}
      {msg && <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${tone[msg.tone]}`}>{msg.text}</p>}
      {(ref || fallbackUrl) && !props.pendingTransfer && (
        <div className="flex flex-wrap gap-3 text-xs">
          {fallbackUrl && <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0b4fb3] underline">Open Paystack in a new tab</a>}
          {ref && <button type="button" onClick={() => void verify(ref)} className="font-semibold text-[#0b4fb3] underline">I have paid: check payment</button>}
        </div>
      )}
      {showBank && props.bank && (
        <form onSubmit={submitTransfer} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-800">
            <p>Transfer exactly <b>{props.priceLabel}</b> to:</p>
            <p className="mt-1"><b>{props.bank.accountName}</b><br />{props.bank.bankName} · <span className="font-mono">{props.bank.accountNumber}</span></p>
            {props.bank.instructions && <p className="mt-1 text-xs text-slate-600">{props.bank.instructions}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name on the account you paid from *</label><input name="payerName" required maxLength={150} className="input" /></div>
            <div><label className="label">Your bank</label><input name="payerBank" maxLength={100} className="input" /></div>
            <div><label className="label">Date of transfer *</label><input name="transferDate" type="date" required className="input" /></div>
            <div><label className="label">Receipt / screenshot (PDF, JPG, PNG; optional)</label><input name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png" className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Note (optional)</label><input name="payerNote" maxLength={1000} className="input" placeholder="e.g. transaction ID from your bank app" /></div>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "I have made the transfer"}</button>
        </form>
      )}
    </div>
  );
}
