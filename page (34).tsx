import { requireUser } from "@/lib/auth";
import { registerStudentAction } from "@/lib/actions/users";
import { CLASS_LEVELS, DEPARTMENTS, SEMESTERS } from "@/lib/queries";
import { Flash, PageHeader } from "@/components/ui";

export default async function AdmitStudentPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { msg, err } = await searchParams;
  return (
    <div>
      <PageHeader title="Admit Student" subtitle="Register a new student. The student can later update school, class, department and semester from their dashboard." />
      <Flash msg={msg} err={err} />
      <form action={registerStudentAction} className="card max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Full name *</label><input name="name" required className="input" /></div>
          <div><label className="label">Email *</label><input name="email" type="email" required className="input" /></div>
          <div><label className="label">Username *</label><input name="username" required className="input" placeholder="e.g. john.doe" /></div>
          <div><label className="label">Password</label><input name="password" className="input" placeholder="default: student123" /></div>
          <div><label className="label">Admission number</label><input name="admissionNo" className="input" placeholder="auto-generated if empty" /></div>
          <div className="sm:col-span-2"><label className="label">School / Institution</label><input name="schoolName" className="input" /></div>
          <div>
            <label className="label">Class / Level</label>
            <input name="classLevel" list="levels" className="input" />
            <datalist id="levels">{CLASS_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <div>
            <label className="label">Department</label>
            <input name="department" list="depts" className="input" />
            <datalist id="depts">{DEPARTMENTS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <div>
            <label className="label">Semester / Term</label>
            <input name="semester" list="sems" className="input" />
            <datalist id="sems">{SEMESTERS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <div>
            <label className="label">Gender</label>
            <select name="gender" className="input"><option value="">Select</option><option>Male</option><option>Female</option></select>
          </div>
          <div><label className="label">Phone</label><input name="phone" className="input" /></div>
        </div>
        <button className="btn-primary">Register Student</button>
      </form>
    </div>
  );
}
