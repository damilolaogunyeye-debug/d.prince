import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseRegistrations, courses, studentProfiles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { bulkReviewAction, reviewRegistrationAction, reviewSingleAction } from "@/lib/actions/academics";
import { Empty, Flash, PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { SelectAll } from "@/components/SelectAll";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; show?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { msg, err, show } = await searchParams;
  const rows = await db
    .select({
      id: courseRegistrations.id, status: courseRegistrations.status, createdAt: courseRegistrations.createdAt,
      student: users.name, admissionNo: studentProfiles.admissionNo, classLevel: studentProfiles.classLevel, department: studentProfiles.department,
      code: courses.code, title: courses.title,
    })
    .from(courseRegistrations)
    .innerJoin(users, eq(users.id, courseRegistrations.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .innerJoin(courses, eq(courses.id, courseRegistrations.courseId))
    .orderBy(desc(courseRegistrations.createdAt));
  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <div>
      <PageHeader title="Course Approvals" subtitle="Students can only write CBT tests for courses you approve here." />
      <Flash msg={msg} err={err} />
      <form action={bulkReviewAction} className="card mb-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Pending ({pending.length})</h2>
          <div className="flex gap-2">
            <button name="status" value="approved" className="btn-success btn-sm">Approve Selected</button>
            <button name="status" value="rejected" className="btn-danger btn-sm">Reject Selected</button>
          </div>
        </div>
        {pending.length === 0 ? <div className="p-5"><Empty text="No pending registrations." /></div> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th><SelectAll name="ids" /></th><th>Student</th><th>Class / Dept</th><th>Course</th><th>Requested</th><th></th></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" name="ids" value={r.id} className="h-4 w-4" /></td>
                    <td><p className="font-medium">{r.student}</p><p className="font-mono text-xs text-slate-500">{r.admissionNo ?? ""}</p></td>
                    <td className="text-xs text-slate-500">{[r.classLevel, r.department].filter(Boolean).join(" · ") || "—"}</td>
                    <td><b>{r.code}</b> — {r.title}</td>
                    <td className="text-xs text-slate-500">{fmtDate(r.createdAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button formAction={reviewSingleAction.bind(null, r.id, "approved")} className="btn-success btn-sm">Approve</button>
                        <button formAction={reviewSingleAction.bind(null, r.id, "rejected")} className="btn-outline btn-sm">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </form>

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Reviewed ({reviewed.length})</h2>
          {!show && reviewed.length > 10 && <Link href="/dashboard/courses/approvals?show=all" className="text-sm text-[#0b4fb3] hover:underline">Show all</Link>}
        </div>
        {reviewed.length === 0 ? <div className="p-5"><Empty text="Nothing reviewed yet." /></div> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Student</th><th>Course</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(show ? reviewed : reviewed.slice(0, 10)).map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.student}</td>
                    <td><b>{r.code}</b> — {r.title}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      <form action={reviewRegistrationAction} className="flex justify-end">
                        <input type="hidden" name="id" value={r.id} />
                        <button name="status" value={r.status === "approved" ? "rejected" : "approved"} className="btn-outline btn-sm">{r.status === "approved" ? "Revoke" : "Approve"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
