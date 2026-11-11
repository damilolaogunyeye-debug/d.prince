import Link from "next/link";
import Form from "next/form";
import { requireUser } from "@/lib/auth";
import { listStudents } from "@/lib/queries";
import { removeUserAction, toggleActiveAction } from "@/lib/actions/users";
import { Empty, Flash, PageHeader, StatusBadge } from "@/components/ui";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; q?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { msg, err, q } = await searchParams;
  const all = await listStudents();
  const query = (q ?? "").toLowerCase();
  const students = query
    ? all.filter((s) => [s.name, s.email, s.username, s.admissionNo, s.classLevel, s.department, s.schoolName].some((v) => v?.toLowerCase().includes(query)))
    : all;

  return (
    <div>
      <PageHeader
        title="Student Information"
        subtitle={`${all.length} registered student(s)`}
        action={
          <div className="flex gap-2">
            <Link href="/dashboard/students/bulk" className="btn-outline">Bulk Upload</Link>
            <Link href="/dashboard/students/new" className="btn-primary">+ Admit Student</Link>
          </div>
        }
      />
      <Flash msg={msg} err={err} />
      <Form action="/dashboard/students" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Search by name, email, admission no, class..." className="input max-w-md" />
        <button className="btn-outline">Search</button>
      </Form>
      <div className="card overflow-x-auto p-0">
        {students.length === 0 ? <div className="p-5"><Empty text="No students found. Admit a student to get started." /></div> : (
          <table className="table">
            <thead>
              <tr><th>Admission No</th><th>Name</th><th>Login</th><th>School</th><th>Class</th><th>Dept</th><th>Semester</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.admissionNo ?? "—"}</td>
                  <td className="font-medium"><Link href={`/dashboard/students/${s.id}`} className="text-[#0b4fb3] hover:underline">{s.name}</Link></td>
                  <td className="text-xs text-slate-500">{s.username}<br />{s.email}</td>
                  <td>{s.schoolName ?? "—"}</td>
                  <td>{s.classLevel ?? "—"}</td>
                  <td>{s.department ?? "—"}</td>
                  <td>{s.semester ?? "—"}</td>
                  <td><StatusBadge status={s.isActive ? "active" : "inactive"} /></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Link href={`/dashboard/students/${s.id}`} className="btn-outline btn-sm">View</Link>
                      <form action={toggleActiveAction}><input type="hidden" name="id" value={s.id} /><button className="btn-outline btn-sm">{s.isActive ? "Deactivate" : "Activate"}</button></form>
                      <form action={removeUserAction}><input type="hidden" name="id" value={s.id} /><button className="btn-danger btn-sm">Remove</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
