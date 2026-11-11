import { requireUser, ROLE_LABEL, type Role } from "@/lib/auth";
import { listSessions } from "@/lib/queries";
import { changePasswordAction, updateAccountAction } from "@/lib/actions/auth";
import { updateMyProfileAction } from "@/lib/actions/users";
import { CLASS_LEVELS, DEPARTMENTS, SEMESTERS, getProfile, isStaff } from "@/lib/queries";
import { Flash, PageHeader } from "@/components/ui";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const sessions = await listSessions();
  const { msg, err } = await searchParams;
  const profile = await getProfile(me.id);
  const student = !isStaff(me);

  return (
    <div>
      <PageHeader title="My Profile" subtitle={student ? "Enter your school/institution, class/level, department and semester details." : "Your account details."} />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0b4fb3] text-3xl font-bold text-white">{me.name.charAt(0)}</span>
            <h2 className="mt-3 text-lg font-semibold">{me.name}</h2>
            <p className="text-sm text-slate-500">{me.email}</p>
            <p className="text-sm text-slate-500">@{me.username}</p>
            <span className="badge-blue mt-2">{ROLE_LABEL[me.role as Role]}</span>
            {student && profile?.admissionNo && <p className="mt-3 text-sm">Admission No: <b>{profile.admissionNo}</b></p>}
          </div>
          <form action={changePasswordAction} className="mt-6 space-y-3 border-t border-slate-100 pt-4">
            <h3 className="font-semibold">Change Password</h3>
            <div><label className="label">Current password</label><input name="current" type="password" required className="input" /></div>
            <div><label className="label">New password</label><input name="next" type="password" minLength={6} required className="input" /></div>
            <button className="btn-primary w-full">Update Password</button>
          </form>
        </div>

        {student ? (
          <form action={updateMyProfileAction} className="card space-y-4 lg:col-span-2">
            <h3 className="font-semibold">Academic Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Full name</label><input name="name" defaultValue={me.name} className="input" /></div>
              <div className="sm:col-span-2"><label className="label">School / Institution name</label><input name="schoolName" defaultValue={profile?.schoolName ?? ""} placeholder="e.g. D.prince College" className="input" required /></div>
              <div>
                <label className="label">Class / Level</label>
                <input name="classLevel" list="levels" defaultValue={profile?.classLevel ?? ""} placeholder="e.g. SSS 2 or 200 Level" className="input" required />
                <datalist id="levels">{CLASS_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <label className="label">Department</label>
                <input name="department" list="depts" defaultValue={profile?.department ?? ""} placeholder="e.g. Science" className="input" required />
                <datalist id="depts">{DEPARTMENTS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <label className="label">Semester / Term</label>
                <input name="semester" list="sems" defaultValue={profile?.semester ?? ""} placeholder="e.g. First Semester" className="input" required />
                <datalist id="sems">{SEMESTERS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div><label className="label">Academic session</label>{sessions.length ? (
                <select name="session" defaultValue={profile?.session ?? ""} className="input">
                  <option value="">Select session</option>
                  {profile?.session && !sessions.some((s) => s.name === profile.session) && <option value={profile.session}>{profile.session}</option>}
                  {sessions.map((s) => <option key={s.id} value={s.name}>{s.name}{s.isCurrent ? " (current)" : ""}</option>)}
                </select>
              ) : (
                <input name="session" defaultValue={profile?.session ?? ""} placeholder="e.g. 2025/2026" className="input" />
              )}</div>
            </div>
            <h3 className="pt-2 font-semibold">Personal Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label">Phone</label><input name="phone" defaultValue={profile?.phone ?? ""} className="input" /></div>
              <div>
                <label className="label">Gender</label>
                <select name="gender" defaultValue={profile?.gender ?? ""} className="input">
                  <option value="">Select</option><option>Male</option><option>Female</option>
                </select>
              </div>
              <div><label className="label">Date of birth</label><input name="dateOfBirth" type="date" defaultValue={profile?.dateOfBirth ?? ""} className="input" /></div>
              <div><label className="label">Guardian name</label><input name="guardianName" defaultValue={profile?.guardianName ?? ""} className="input" /></div>
              <div><label className="label">Guardian phone</label><input name="guardianPhone" defaultValue={profile?.guardianPhone ?? ""} className="input" /></div>
              <div className="sm:col-span-2"><label className="label">Home address</label><textarea name="address" rows={2} defaultValue={profile?.address ?? ""} className="input" /></div>
            </div>
            <button className="btn-primary">Save Information</button>
          </form>
        ) : (
          <div className="space-y-6 lg:col-span-2">
          <form action={updateAccountAction} className="card space-y-4">
            <h3 className="font-semibold">Account details</h3>
            <p className="text-sm text-slate-500">This is what you sign in with. Change the email and username to your own.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="acc-name">Full name</label><input id="acc-name" name="name" defaultValue={me.name} required className="input" /></div>
              <div><label className="label" htmlFor="acc-email">Email</label><input id="acc-email" name="email" type="email" defaultValue={me.email} required className="input" /></div>
              <div><label className="label" htmlFor="acc-username">Username</label><input id="acc-username" name="username" defaultValue={me.username} required className="input" /></div>
            </div>
            <button className="btn-primary">Save account details</button>
          </form>
          <div className="card">
            <h3 className="font-semibold">Account Permissions</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Register and manage students, promote students, mark attendance.</li>
              <li>Approve course/subject registrations before students can write CBT tests.</li>
              <li>Create CBT tests with timers, start/end dates, import questions or use the AI assistant.</li>
              <li>Publish notices and reply to student messages.</li>
              {me.role === "super_admin" && <li className="font-medium text-[#0b4fb3]">Super Admin: add/remove staff, remove students, and control everything on the portal.</li>}
            </ul>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
