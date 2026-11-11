import Form from "next/form";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { courseMaterials, materialPayments, studentProfiles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { bankDetails, formatNaira, maskKey, paystackKeys } from "@/lib/payments";
import { reviewTransferAction, saveBankDetailsAction, savePaystackKeysAction } from "@/lib/actions/payments";
import { AssignmentFileButtons } from "@/components/AssignmentFileButtons";
import { Empty, Flash, PageHeader } from "@/components/ui";

const reviewer = alias(users, "reviewer");
const badge: Record<string, string> = { paid: "badge-green", pending: "badge-yellow", failed: "badge-red", rejected: "badge-red" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; status?: string; method?: string }> }) {
  const me = await requireUser(["staff", "super_admin"]);
  const sp = await searchParams;
  const isSuper = me.role === "super_admin";

  const base = db
    .select({ p: materialPayments, title: courseMaterials.title, student: users.name, admissionNo: studentProfiles.admissionNo, classLevel: studentProfiles.classLevel, reviewerName: reviewer.name })
    .from(materialPayments)
    .innerJoin(courseMaterials, eq(courseMaterials.id, materialPayments.materialId))
    .innerJoin(users, eq(users.id, materialPayments.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, materialPayments.studentId))
    .leftJoin(reviewer, eq(reviewer.id, materialPayments.reviewedBy));

  const pending = await base.where(and(eq(materialPayments.method, "bank_transfer"), eq(materialPayments.status, "pending"))).orderBy(materialPayments.createdAt);
  const where: SQL[] = [];
  if (["paid", "pending", "failed", "rejected"].includes(sp.status ?? "")) where.push(eq(materialPayments.status, sp.status!));
  if (sp.method === "paystack" || sp.method === "bank_transfer") where.push(eq(materialPayments.method, sp.method));
  const all = await base.where(where.length ? and(...where) : undefined).orderBy(desc(materialPayments.createdAt)).limit(300);
  const totalPaid = all.filter((r) => r.p.status === "paid").reduce((s, r) => s + r.p.amountKobo, 0);

  const bank = await bankDetails();
  const keys = isSuper ? await paystackKeys() : null;

  return (
    <div>
      <PageHeader title="Payments" subtitle="Payments for course materials. Paystack payments are confirmed automatically with Paystack; bank transfers need confirming here." />
      <Flash msg={sp.msg} err={sp.err} />

      <div className="card mb-6">
        <h2 className="font-semibold">Bank transfers waiting for confirmation ({pending.length})</h2>
        <p className="mt-1 text-sm text-slate-600">Check that the money has arrived in the school&apos;s account before confirming. Confirming unlocks the material for the student.</p>
        {pending.length === 0 ? <p className="mt-3 text-sm text-slate-500">None waiting.</p> : (
          <div className="mt-3 space-y-3">
            {pending.map(({ p, title, student, admissionNo, classLevel }) => (
              <div key={p.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <p><b>{student}</b>{admissionNo ? ` · ${admissionNo}` : ""}{classLevel ? ` · ${classLevel}` : ""}</p>
                    <p>{title} · <b>{formatNaira(p.amountKobo)}</b></p>
                    <p className="text-slate-600">From: {p.payerName}{p.payerBank ? ` (${p.payerBank})` : ""} · on {p.transferDate}</p>
                    {p.payerNote && <p className="text-slate-600">Note: {p.payerNote}</p>}
                    <p className="font-mono text-xs text-slate-500">Ref {p.reference} · reported {p.createdAt.toLocaleString("en-GB")}</p>
                  </div>
                  {p.proofFileName ? <AssignmentFileButtons id={p.id} fileName={p.proofFileName} fileType={p.proofType ?? ""} url={`/api/payments/${p.id}/proof`} label="Download receipt" /> : <span className="text-xs text-slate-500">No receipt attached</span>}
                </div>
                <form action={reviewTransferAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="min-w-0 flex-1"><label className="label">Note (required when rejecting)</label><input name="note" maxLength={1000} className="input" /></div>
                  <button name="decision" value="confirm" className="btn-primary">Confirm: money received</button>
                  <button name="decision" value="reject" className="btn-outline">Reject</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <Form action="/dashboard/payments" className="mb-3 flex flex-wrap items-end gap-2">
        <div><label className="label">Status</label><select name="status" defaultValue={sp.status ?? ""} className="input w-40"><option value="">All</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="rejected">Rejected</option></select></div>
        <div><label className="label">Method</label><select name="method" defaultValue={sp.method ?? ""} className="input w-40"><option value="">All</option><option value="paystack">Paystack</option><option value="bank_transfer">Bank transfer</option></select></div>
        <button className="btn-outline">Filter</button>
      </Form>
      {all.length === 0 ? <Empty text="No payments yet." /> : (
        <div className="card overflow-x-auto">
          <p className="mb-2 text-sm text-slate-600">Paid in this list: <b>{formatNaira(totalPaid)}</b></p>
          <table className="table">
            <thead><tr><th>Date</th><th>Student</th><th>Material</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {all.map(({ p, title, student, reviewerName }) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-xs">{p.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{student}</td>
                  <td>{title}</td>
                  <td>{p.method === "paystack" ? "Paystack" : "Bank transfer"}</td>
                  <td>{formatNaira(p.amountKobo)}</td>
                  <td><span className={badge[p.status] ?? "badge-gray"}>{p.status}</span>{reviewerName && <span className="block text-xs text-slate-500">by {reviewerName}</span>}{p.reviewNote && <span className="block text-xs text-slate-500">{p.reviewNote}</span>}</td>
                  <td className="font-mono text-xs">{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isSuper && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <form action={saveBankDetailsAction} className="card space-y-3">
            <h2 className="font-semibold">School bank account (for transfers)</h2>
            <p className="text-sm text-slate-600">Shown to students who choose bank transfer.</p>
            <div><label className="label">Bank name *</label><input name="bankName" defaultValue={bank.bankName} required className="input" /></div>
            <div><label className="label">Account number (10 digits) *</label><input name="accountNumber" defaultValue={bank.accountNumber} required inputMode="numeric" pattern="\s*\d{10}\s*" className="input font-mono" /></div>
            <div><label className="label">Account name *</label><input name="accountName" defaultValue={bank.accountName} required className="input" /></div>
            <div><label className="label">Extra instructions (optional)</label><input name="instructions" defaultValue={bank.instructions} className="input" placeholder="e.g. Use your admission number as the narration" /></div>
            <button className="btn-primary">Save bank details</button>
          </form>
          <form action={savePaystackKeysAction} className="card space-y-3">
            <h2 className="font-semibold">Paystack</h2>
            <p className="text-sm text-slate-600">
              Current: secret <span className="font-mono">{maskKey(keys!.secret)}</span>, public <span className="font-mono">{maskKey(keys!.pub)}</span>.{" "}
              {keys!.secret ? (keys!.testMode ? <b className="text-amber-700">Test mode: no real money.</b> : <b className="text-emerald-700">Live mode: real payments.</b>) : <b>Not set up.</b>}
            </p>
            <div><label className="label">New secret key (sk_…)</label><input name="secret" type="password" autoComplete="off" className="input font-mono" /></div>
            <div><label className="label">New public key (pk_…)</label><input name="public" autoComplete="off" className="input font-mono" /></div>
            <p className="text-xs text-slate-500">Leave a field empty to keep the current key. The secret key is checked with Paystack before saving and is never shown again. Switch to live keys only when you are ready to take real money.</p>
            <button className="btn-primary">Save Paystack keys</button>
          </form>
        </div>
      )}
    </div>
  );
}
