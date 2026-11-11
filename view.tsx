import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, courseRegistrations, courses, materialPayments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { bankDetails, bankReady, formatNaira, paystackKeys, verifyPaystackReference } from "@/lib/payments";
import { deleteMaterialAction, toggleMaterialAction } from "@/lib/actions/payments";
import { MaterialUpload } from "@/components/MaterialUpload";
import { MaterialPurchase } from "@/components/MaterialPurchase";
import { AssignmentFileButtons } from "@/components/AssignmentFileButtons";
import { Empty, Flash, PageHeader } from "@/components/ui";

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const statusBadge: Record<string, string> = { paid: "badge-green", pending: "badge-yellow", failed: "badge-red", rejected: "badge-red" };

export type MaterialKind = "handout" | "past_question";
const TEXT = {
  handout: {
    title: "Course Materials",
    staffSub: "Upload handouts for students. Set a price, or 0 to make a handout free. Students download paid handouts after paying by Paystack or bank transfer.",
    studentSub: "Handouts for your courses. Free ones download straight away; paid ones unlock after payment.",
    none: "No materials uploaded yet.",
    noneStudent: "No materials for your courses yet.",
    download: "Download handout",
    path: "/dashboard/materials",
  },
  past_question: {
    title: "Past Questions",
    staffSub: "Upload past examination question papers. Usually free (price 0); a price can be set if needed.",
    studentSub: "Past examination questions for your courses, for revision.",
    none: "No past questions uploaded yet.",
    noneStudent: "No past questions for your courses yet.",
    download: "Download paper",
    path: "/dashboard/past-questions",
  },
} as const;

export async function MaterialsView({ kind, searchParams }: { kind: MaterialKind; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;
  const T = TEXT[kind];
  const isStudent = me.role === "student";

  if (!isStudent) {
    const allCourses = await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).orderBy(courses.code);
    const rows = await db
      .select({
        m: courseMaterials,
        courseCode: courses.code,
        paidCount: sql<number>`(select count(*)::int from material_payments p where p.material_id = ${courseMaterials.id} and p.status = 'paid')`,
        paidTotal: sql<number>`(select coalesce(sum(p.amount_kobo), 0)::int from material_payments p where p.material_id = ${courseMaterials.id} and p.status = 'paid')`,
      })
      .from(courseMaterials)
      .leftJoin(courses, eq(courses.id, courseMaterials.courseId))
      .where(eq(courseMaterials.kind, kind))
      .orderBy(desc(courseMaterials.createdAt));
    return (
      <div>
        <PageHeader title={T.title} subtitle={T.staffSub} />
        <Flash msg={msg} err={err} />
        <MaterialUpload kind={kind} courses={allCourses.map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` }))} />
        {rows.length === 0 ? <Empty text={T.none} /> : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Material</th><th>Course</th><th>Price</th><th>Paid by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(({ m, courseCode, paidCount, paidTotal }) => (
                  <tr key={m.id}>
                    <td><p className="font-medium">{m.title}</p>{(m.examSession || m.examType) && <p className="text-xs text-slate-600">{[m.examType, m.examSession].filter(Boolean).join(" · ")}</p>}<p className="text-xs text-slate-500">{m.fileName} · {m.fileType.toUpperCase()} · {size(m.fileSize)}</p></td>
                    <td>{courseCode ?? "All students"}</td>
                    <td>{m.priceKobo ? formatNaira(m.priceKobo) : <span className="badge-green">Free</span>}</td>
                    <td>{m.priceKobo ? `${paidCount} student(s) · ${formatNaira(paidTotal)}` : "—"}</td>
                    <td>{m.isPublished ? <span className="badge-green">Visible</span> : <span className="badge-gray">Hidden</span>}</td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <AssignmentFileButtons id={m.id} fileName={m.fileName} fileType={m.fileType} url={`/api/materials/${m.id}/file`} />
                        <form action={toggleMaterialAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={T.path} /><button className="btn-outline px-2 py-1 text-xs">{m.isPublished ? "Hide" : "Show"}</button></form>
                        <form action={deleteMaterialAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={T.path} /><button className="px-2 py-1 text-xs font-medium text-red-700 hover:underline">Delete</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---------- Student ----------
  // Re-check unfinished Paystack payments from the last day (e.g. paid in a tab that was then closed).
  const unfinished = await db
    .select({ reference: materialPayments.reference })
    .from(materialPayments)
    .where(and(eq(materialPayments.studentId, me.id), eq(materialPayments.method, "paystack"), eq(materialPayments.status, "pending"), gt(materialPayments.createdAt, new Date(Date.now() - 86_400_000))))
    .orderBy(desc(materialPayments.createdAt))
    .limit(3);
  for (const u of unfinished) await verifyPaystackReference(u.reference).catch(() => null);

  const approved = (await db.select({ c: courseRegistrations.courseId }).from(courseRegistrations).where(and(eq(courseRegistrations.studentId, me.id), eq(courseRegistrations.status, "approved")))).map((r) => r.c);
  const materials = await db
    .select({ m: courseMaterials, courseCode: courses.code, courseTitle: courses.title })
    .from(courseMaterials)
    .leftJoin(courses, eq(courses.id, courseMaterials.courseId))
    .where(and(eq(courseMaterials.kind, kind), eq(courseMaterials.isPublished, true), approved.length ? or(isNull(courseMaterials.courseId), inArray(courseMaterials.courseId, approved)) : isNull(courseMaterials.courseId)))
    .orderBy(desc(courseMaterials.createdAt));
  const payments = await db
    .select({ p: materialPayments, title: courseMaterials.title })
    .from(materialPayments)
    .innerJoin(courseMaterials, eq(courseMaterials.id, materialPayments.materialId))
    .where(and(eq(materialPayments.studentId, me.id), eq(courseMaterials.kind, kind)))
    .orderBy(desc(materialPayments.createdAt));
  const keys = await paystackKeys();
  const bank = await bankDetails();

  return (
    <div>
      <PageHeader title={T.title} subtitle={T.studentSub} />
      <Flash msg={msg} err={err} />
      {keys.testMode && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Paystack is in <b>test mode</b>: no real money is taken. Use a Paystack test card.</p>}
      {materials.length === 0 ? <Empty text={T.noneStudent} /> : (
        <div className="space-y-3">
          {materials.map(({ m, courseCode, courseTitle }) => {
            const mine = payments.filter((x) => x.p.materialId === m.id).map((x) => x.p);
            const paid = mine.some((p) => p.status === "paid");
            const pendingTransfer = mine.some((p) => p.method === "bank_transfer" && p.status === "pending");
            const lastRejected = mine.find((p) => p.method === "bank_transfer" && p.status === "rejected");
            const lastPaystack = mine.find((p) => p.method === "paystack" && p.status === "pending");
            const unlocked = m.priceKobo === 0 || paid;
            return (
              <div key={m.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{m.title}</p>
                    <p className="text-sm text-slate-600">{courseCode ? `${courseCode} — ${courseTitle}` : "For all students"} · {m.fileType.toUpperCase()} · {size(m.fileSize)}</p>
                    {(m.examSession || m.examType) && <p className="text-sm font-medium text-slate-700">{[m.examType, m.examSession].filter(Boolean).join(" · ")}</p>}
                    {m.description && <p className="mt-1 text-sm text-slate-700">{m.description}</p>}
                  </div>
                  <div className="text-right">
                    {m.priceKobo === 0 ? <span className="badge-green">Free</span> : paid ? <span className="badge-green">Paid</span> : <span className="text-lg font-bold text-slate-900">{formatNaira(m.priceKobo)}</span>}
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {unlocked ? (
                    <AssignmentFileButtons id={m.id} fileName={m.fileName} fileType={m.fileType} url={`/api/materials/${m.id}/file`} label={T.download} />
                  ) : (
                    <>
                      {lastRejected && !pendingTransfer && <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Your last bank transfer was not accepted: {lastRejected.reviewNote}</p>}
                      <MaterialPurchase materialId={m.id} priceLabel={formatNaira(m.priceKobo)} paystackReady={Boolean(keys.secret)} bank={bankReady(bank) ? bank : null} pendingTransfer={pendingTransfer} lastPaystackRef={lastPaystack?.reference ?? null} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payments.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <h2 className="mb-2 font-semibold">My payments</h2>
          <table className="table">
            <thead><tr><th>Date</th><th>Material</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {payments.map(({ p, title }) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-xs">{p.createdAt.toLocaleDateString("en-GB")}</td>
                  <td>{title}</td>
                  <td>{p.method === "paystack" ? "Paystack" : "Bank transfer"}</td>
                  <td>{formatNaira(p.amountKobo)}</td>
                  <td><span className={statusBadge[p.status] ?? "badge-gray"}>{p.status === "pending" ? (p.method === "paystack" ? "not completed" : "awaiting confirmation") : p.status}</span></td>
                  <td className="font-mono text-xs">{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
