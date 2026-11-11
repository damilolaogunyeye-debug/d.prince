import { requireUser } from "@/lib/auth";
import { listStaff } from "@/lib/queries";
import { addStaffAction, removeUserAction, resetPasswordAction, toggleActiveAction } from "@/lib/actions/users";
import { Flash, PageHeader, StatusBadge, fmtDay } from "@/components/ui";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser(["super_admin"]);
  const { msg, err } = await searchParams;
  const staff = await listStaff();

  return (
    <div>
      <PageHeader title="Staff Management" subtitle="Only the Super Admin can add or remove staff." />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form action={addStaffAction} className="card space-y-3 lg:col-span-1">
          <h2 className="font-semibold">Add Staff</h2>
          <div><label className="label">Full name *</label><input name="name" required className="input" /></div>
          <div><label className="label">Email *</label><input name="email" type="email" required className="input" /></div>
          <div><label className="label">Username *</label><input name="username" required className="input" /></div>
          <div><label className="label">Password</label><input name="password" className="input" placeholder="default: staff123" /></div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input"><option value="staff">Staff</option><option value="super_admin">Super Admin</option></select>
          </div>
          <button className="btn-primary w-full">Add Staff</button>
        </form>
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table">
            <thead><tr><th>Name</th><th>Login</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}{s.id === me.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</td>
                  <td className="text-xs text-slate-500">{s.username}<br />{s.email}</td>
                  <td><span className={s.role === "super_admin" ? "badge-blue" : "badge-gray"}>{s.role === "super_admin" ? "Super Admin" : "Staff"}</span></td>
                  <td><StatusBadge status={s.isActive ? "active" : "inactive"} /></td>
                  <td className="text-xs text-slate-500">{fmtDay(s.createdAt)}</td>
                  <td>
                    {s.id !== me.id && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <form action={resetPasswordAction} className="flex gap-1">
                          <input type="hidden" name="id" value={s.id} />
                          <input name="password" placeholder="new pass" className="input w-24 py-1 text-xs" />
                          <button className="btn-outline btn-sm">Reset</button>
                        </form>
                        <form action={toggleActiveAction}><input type="hidden" name="id" value={s.id} /><button className="btn-outline btn-sm">{s.isActive ? "Deactivate" : "Activate"}</button></form>
                        <form action={removeUserAction}><input type="hidden" name="id" value={s.id} /><button className="btn-danger btn-sm">Remove</button></form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
