import Link from "next/link";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStaff, listStaff } from "@/lib/queries";
import { sendMessageAction } from "@/lib/actions/communication";
import { Empty, Flash, PageHeader, fmtDate } from "@/components/ui";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;
  const staff = isStaff(me);
  const sender = alias(users, "sender");
  const recipient = alias(users, "recipient");

  // Threads = top-level messages visible to me
  const visible = staff
    ? or(isNull(messages.recipientId), eq(messages.recipientId, me.id), eq(messages.senderId, me.id))
    : or(eq(messages.senderId, me.id), eq(messages.recipientId, me.id));
  const threads = await db
    .select({
      id: messages.id, subject: messages.subject, body: messages.body, createdAt: messages.createdAt, isRead: messages.isRead,
      senderId: messages.senderId, senderName: sender.name, senderRole: sender.role, recipientName: recipient.name,
      replies: sql<number>`(select count(*)::int from messages r where r.parent_id = ${messages.id})`,
      lastAt: sql<string>`coalesce((select max(r.created_at) from messages r where r.parent_id = ${messages.id}), ${messages.createdAt})`,
      unread: sql<number>`(select count(*)::int from messages r where r.parent_id = ${messages.id} and r.is_read = false and r.sender_id <> ${me.id})`,
    })
    .from(messages)
    .innerJoin(sender, eq(sender.id, messages.senderId))
    .leftJoin(recipient, eq(recipient.id, messages.recipientId))
    .where(and(isNull(messages.parentId), visible))
    .orderBy(desc(sql`coalesce((select max(r.created_at) from messages r where r.parent_id = ${messages.id}), ${messages.createdAt})`));

  const staffList = staff ? [] : await listStaff();
  const studentsList = staff
    ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "student")).orderBy(users.name)
    : [];

  return (
    <div>
      <PageHeader title="Messages" subtitle={staff ? "Messages from students and your replies." : "Send a message directly to staff or the super admin."} />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-0 lg:col-span-2">
          {threads.length === 0 ? <div className="p-5"><Empty text="No messages yet." /></div> : (
            <ul className="divide-y divide-slate-100">
              {threads.map((t) => {
                const highlight = (!t.isRead && t.senderId !== me.id) || t.unread > 0;
                return (
                  <li key={t.id}>
                    <Link href={`/dashboard/messages/${t.id}`} className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b4fb3] font-bold text-white">{t.senderName.charAt(0)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate ${highlight ? "font-bold" : "font-medium"}`}>{t.subject}</p>
                          <span className="shrink-0 text-xs text-slate-400">{fmtDate(t.lastAt)}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {t.senderId === me.id ? "You" : t.senderName} <span className="badge-gray">{t.senderRole.replace("_", " ")}</span> → {t.recipientName ?? "All Staff / Admin"}
                          {t.replies > 0 && <span className="ml-2">· {t.replies} repl{t.replies === 1 ? "y" : "ies"}</span>}
                          {highlight && <span className="badge-blue ml-2">new</span>}
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-600">{t.body}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <form action={sendMessageAction} className="card space-y-3 self-start">
          <h2 className="font-semibold">New Message</h2>
          <div>
            <label className="label">To</label>
            <select name="recipientId" className="input" required={staff}>
              {staff ? (
                <>
                  <option value="">Select student</option>
                  {studentsList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </>
              ) : (
                <>
                  <option value="">All Staff / Super Admin</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role === "super_admin" ? "Super Admin" : "Staff"})</option>)}
                </>
              )}
            </select>
          </div>
          <div><label className="label">Subject *</label><input name="subject" required className="input" /></div>
          <div><label className="label">Message *</label><textarea name="body" required rows={5} className="input" /></div>
          <button className="btn-primary w-full">Send Message</button>
        </form>
      </div>
    </div>
  );
}
