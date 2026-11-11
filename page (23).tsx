import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { notices, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/queries";
import { createNoticeAction, deleteNoticeAction } from "@/lib/actions/communication";
import { Empty, Flash, PageHeader, fmtDate } from "@/components/ui";

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;
  const staff = isStaff(me);
  const rows = await db
    .select({ id: notices.id, title: notices.title, body: notices.body, audience: notices.audience, createdAt: notices.createdAt, author: users.name, authorRole: users.role })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.createdBy))
    .where(staff ? undefined : or(eq(notices.audience, "all"), eq(notices.audience, "students")))
    .orderBy(desc(notices.createdAt));

  return (
    <div>
      <PageHeader title="Notice Board" subtitle={staff ? "Publish notices for all students and staff." : "Announcements from your school."} />
      <Flash msg={msg} err={err} />
      <div className={`grid gap-6 ${staff ? "lg:grid-cols-3" : ""}`}>
        <div className={`space-y-4 ${staff ? "lg:col-span-2" : ""}`}>
          {rows.length === 0 ? <Empty text="No notices yet." /> : rows.map((n) => (
            <article key={n.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{n.title}</h2>
                  <p className="text-xs text-slate-400">By {n.author ?? "Admin"} · {fmtDate(n.createdAt)} · <span className="badge-gray">{n.audience}</span></p>
                </div>
                {staff && <form action={deleteNoticeAction}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-red-600 hover:underline">Delete</button></form>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
            </article>
          ))}
        </div>
        {staff && (
          <form action={createNoticeAction} className="card space-y-3 self-start">
            <h2 className="font-semibold">Publish Notice</h2>
            <div><label className="label">Title *</label><input name="title" required className="input" /></div>
            <div><label className="label">Message *</label><textarea name="body" required rows={6} className="input" /></div>
            <div>
              <label className="label">Audience</label>
              <select name="audience" className="input"><option value="all">Everyone</option><option value="students">Students only</option><option value="staff">Staff only</option></select>
            </div>
            <button className="btn-primary w-full">Publish</button>
          </form>
        )}
      </div>
    </div>
  );
}
