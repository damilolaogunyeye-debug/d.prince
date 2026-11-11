import Form from "next/form";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { assignments, courseRegistrations, courses, studentProfiles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { deleteAssignmentAction, reviewAssignmentAction } from "@/lib/actions/assignments";
import { AssignmentUpload } from "@/components/AssignmentUpload";
import { AssignmentFileButtons } from "@/components/AssignmentFileButtons";
import { Empty, Flash, PageHeader } from "@/components/ui";

const reviewer = alias(users, "reviewer");
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type SP = { msg?: string; err?: string; q?: string; status?: string; course?: string; level?: string };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const isStudent = me.role === "student";

  const where: SQL[] = [];
  if (isStudent) where.push(eq(assignments.studentId, me.id));
  else {
    if (sp.status === "submitted" || sp.status === "reviewed") where.push(eq(assignments.status, sp.status));
    if (Number(sp.course)) where.push(eq(assignments.courseId, Number(sp.course)));
    if (sp.level) where.push(eq(studentProfiles.classLevel, sp.level));
    if (sp.q?.trim()) {
      const like = `%${sp.q.trim()}%`;
      where.push(or(ilike(users.name, like), ilike(assignments.title, like), ilike(studentProfiles.admissionNo, like))!);
    }
  }

  const rows = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      note: assignments.note,
      session: assignments.session,
      fileName: assignments.fileName,
      fileType: assignments.fileType,
      fileSize: assignments.fileSize,
      status: assignments.status,
      feedback: assignments.feedback,
      score: assignments.score,
      maxScore: assignments.maxScore,
      reviewedAt: assignments.reviewedAt,
      createdAt: assignments.createdAt,
      studentName: users.name,
      admissionNo: studentProfiles.admissionNo,
      classLevel: studentProfiles.classLevel,
      courseCode: courses.code,
      courseTitle: courses.title,
      reviewerName: reviewer.name,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, assignments.studentId))
    .leftJoin(courses, eq(courses.id, assignments.courseId))
    .leftJoin(reviewer, eq(reviewer.id, assignments.reviewedBy))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(assignments.createdAt))
    .limit(300);

  const myCourses = isStudent
    ? await db
        .select({ id: courses.id, code: courses.code, title: courses.title })
        .from(courseRegistrations)
        .innerJoin(courses, eq(courses.id, courseRegistrations.courseId))
        .where(and(eq(courseRegistrations.studentId, me.id), eq(courseRegistrations.status, "approved")))
    : [];
  const allCourses = isStudent ? [] : await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).orderBy(courses.code);
  const levels = isStudent
    ? []
    : (await db.selectDistinct({ l: studentProfiles.classLevel }).from(studentProfiles)).map((r) => r.l).filter((l): l is string => Boolean(l)).sort();

  return (
    <div>
      <PageHeader
        title={isStudent ? "My Assignments" : "Assignments"}
        subtitle={isStudent ? "Upload your assignments as PDF or Word (.docx). Your teachers can open them and leave feedback." : "Assignments uploaded by students. Open, download and mark them as reviewed."}
      />
      <Flash msg={sp.msg} err={sp.err} />

      {isStudent && <AssignmentUpload courses={myCourses.map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` }))} />}

      {!isStudent && (
        <Form action="/dashboard/assignments" className="mb-4 flex flex-wrap items-end gap-2">
          <div><label className="label">Search</label><input name="q" defaultValue={sp.q ?? ""} placeholder="Student, title or admission no." className="input w-60" /></div>
          <div><label className="label">Status</label>
            <select name="status" defaultValue={sp.status ?? ""} className="input w-36"><option value="">All</option><option value="submitted">Not marked</option><option value="reviewed">Marked</option></select></div>
          <div><label className="label">Course</label>
            <select name="course" defaultValue={sp.course ?? ""} className="input w-52"><option value="">All courses</option>{allCourses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select></div>
          <div><label className="label">Class</label>
            <select name="level" defaultValue={sp.level ?? ""} className="input w-36"><option value="">All classes</option>{levels.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
          <button className="btn-outline">Filter</button>
        </Form>
      )}

      <div className={isStudent ? "mt-6" : ""}>
        {isStudent && <h2 className="mb-3 font-semibold">My uploads</h2>}
        {rows.length === 0 ? (
          <Empty text={isStudent ? "You have not uploaded any assignments yet." : "No assignments match."} />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{r.title}</p>
                    <p className="text-sm text-slate-600">
                      {!isStudent && <><b>{r.studentName}</b>{r.admissionNo ? ` · ${r.admissionNo}` : ""}{r.classLevel ? ` · ${r.classLevel}` : ""} · </>}
                      {r.courseCode ? `${r.courseCode} — ${r.courseTitle}` : "General"}
                      {r.session ? ` · ${r.session}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{r.fileName} · {r.fileType.toUpperCase()} · {size(r.fileSize)} · uploaded {when(r.createdAt)}</p>
                    {r.note && <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700"><b>Student note:</b> {r.note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {r.status === "reviewed" ? <span className="badge-green">Marked</span> : <span className="badge-yellow">Not marked yet</span>}
                    {r.score !== null && <span className="text-lg font-bold text-[#0b4fb3]">{r.score} / {r.maxScore}{" "}<span className="text-xs font-normal text-slate-500">({Math.round((r.score / r.maxScore) * 100)}%)</span></span>}
                    <AssignmentFileButtons id={r.id} fileName={r.fileName} fileType={r.fileType} />
                  </div>
                </div>

                {r.status === "reviewed" && (
                  <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
                    {r.score !== null && <><b>Score: {r.score} / {r.maxScore}</b> · </>}<b>Feedback{r.reviewerName ? ` from ${r.reviewerName}` : ""}:</b> {r.feedback || "No written feedback."}
                    {r.reviewedAt && <span className="text-xs text-emerald-700"> · {when(r.reviewedAt)}</span>}
                  </p>
                )}

                {!isStudent && (
                  <form action={reviewAssignmentAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="w-24"><label className="label">Score</label><input name="score" inputMode="decimal" defaultValue={r.score ?? ""} placeholder="e.g. 15" className="input" /></div>
                    <div className="w-24"><label className="label">Out of</label><input name="maxScore" type="number" min={1} max={1000} defaultValue={r.maxScore} className="input" /></div>
                    <div className="min-w-0 flex-1">
                      <label className="label">Feedback for the student (optional)</label>
                      <input name="feedback" defaultValue={r.feedback ?? ""} maxLength={2000} className="input" />
                    </div>
                    <button className="btn-primary">{r.status === "reviewed" ? "Update mark" : "Save mark"}</button>
                  </form>
                )}

                {((isStudent && r.status === "submitted") || me.role === "super_admin") && (
                  <form action={deleteAssignmentAction} className="mt-2 text-right">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs font-medium text-red-700 hover:underline">{isStudent ? "Withdraw this upload" : "Delete"}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
