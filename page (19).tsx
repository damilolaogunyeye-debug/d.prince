import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CLASS_LEVELS, DEPARTMENTS, SEMESTERS, getProfile, isStaff, listCourses, studentRegistrations } from "@/lib/queries";
import { createCourseAction, deleteCourseAction, dropCourseAction, registerCourseAction } from "@/lib/actions/academics";
import { Empty, Flash, PageHeader, StatusBadge } from "@/components/ui";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;
  const courses = await listCourses();
  const staff = isStaff(me);

  if (!staff) {
    const [regs, profile] = await Promise.all([studentRegistrations(me.id), getProfile(me.id)]);
    const registeredIds = new Set(regs.map((r) => r.courseId));
    const available = courses.filter((c) => !registeredIds.has(c.id));
    return (
      <div>
        <PageHeader title="My Courses / Subjects" subtitle="Register your courses. A staff/admin must approve each one before you can write its CBT test." />
        <Flash msg={msg} err={err} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="card">
              <h2 className="mb-3 font-semibold">Registered Courses</h2>
              {regs.length === 0 ? <Empty text="You have not registered any course yet." /> : (
                <table className="table">
                  <thead><tr><th>Code</th><th>Title</th><th>Class</th><th>Semester</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {regs.map((r) => (
                      <tr key={r.id}>
                        <td className="font-semibold">{r.code}</td>
                        <td>{r.title}</td>
                        <td>{r.classLevel ?? "—"}</td>
                        <td>{r.semester ?? "—"}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="text-right">{r.status === "pending" && <form action={dropCourseAction}><input type="hidden" name="id" value={r.id} /><button className="btn-outline btn-sm">Withdraw</button></form>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h2 className="mb-3 font-semibold">Available Courses</h2>
              {available.length === 0 ? <Empty text="No other courses available. You can add a new course/subject on the right." /> : (
                <ul className="divide-y divide-slate-100">
                  {available.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">{c.code} — {c.title}</p>
                        <p className="text-xs text-slate-500">{[c.classLevel, c.department, c.semester].filter(Boolean).join(" · ") || "General"}</p>
                      </div>
                      <form action={registerCourseAction}><input type="hidden" name="courseId" value={c.id} /><button className="btn-primary btn-sm">Register</button></form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <CourseForm defaults={{ classLevel: profile?.classLevel ?? "", department: profile?.department ?? "", semester: profile?.semester ?? "" }} title="Add a Course / Subject" note="If your course is not listed, add it here. It will be sent to staff for approval." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Courses / Subjects" subtitle="Manage the course catalogue." action={<Link href="/dashboard/courses/approvals" className="btn-primary">Course Approvals</Link>} />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          {courses.length === 0 ? <div className="p-5"><Empty text="No courses yet." /></div> : (
            <table className="table">
              <thead><tr><th>Code</th><th>Title</th><th>Class / Dept / Semester</th><th>Students</th><th>Tests</th><th>Added by</th><th></th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.code}</td>
                    <td>{c.title}</td>
                    <td className="text-xs text-slate-500">{[c.classLevel, c.department, c.semester].filter(Boolean).join(" · ") || "General"}</td>
                    <td>{c.registrations}</td>
                    <td>{c.tests}</td>
                    <td className="text-xs text-slate-500">{c.createdByName ?? "—"} {c.createdByRole === "student" && <span className="badge-yellow">student</span>}</td>
                    <td className="text-right"><form action={deleteCourseAction}><input type="hidden" name="id" value={c.id} /><button className="btn-danger btn-sm">Delete</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <CourseForm title="Create Course / Subject" />
      </div>
    </div>
  );
}

function CourseForm({ title, note, defaults }: { title: string; note?: string; defaults?: { classLevel: string; department: string; semester: string } }) {
  return (
    <form action={createCourseAction} className="card space-y-3 self-start">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      <div><label className="label">Course code *</label><input name="code" required className="input" placeholder="e.g. MTH101" /></div>
      <div><label className="label">Course title *</label><input name="title" required className="input" placeholder="e.g. Mathematics" /></div>
      <div><label className="label">Class / Level</label><input name="classLevel" list="levels" defaultValue={defaults?.classLevel} className="input" /><datalist id="levels">{CLASS_LEVELS.map((l) => <option key={l} value={l} />)}</datalist></div>
      <div><label className="label">Department</label><input name="department" list="depts" defaultValue={defaults?.department} className="input" /><datalist id="depts">{DEPARTMENTS.map((l) => <option key={l} value={l} />)}</datalist></div>
      <div><label className="label">Semester / Term</label><input name="semester" list="sems" defaultValue={defaults?.semester} className="input" /><datalist id="sems">{SEMESTERS.map((l) => <option key={l} value={l} />)}</datalist></div>
      <div><label className="label">Description</label><textarea name="description" rows={2} className="input" /></div>
      <button className="btn-primary w-full">Save Course</button>
    </form>
  );
}
