import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/queries";
import { deleteMessageAction, markThreadReadAction, sendMessageAction } from "@/lib/actions/communication";
import { Flash, PageHeader, fmtDate } from "@/components/ui";

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const threadId = Number(id);
  const rows = await db
    .select({ id: messages.id, subject: messages.subject, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId, recipientId: messages.recipientId, parentId: messages.parentId, senderName: users.name, senderRole: users.role })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(or(eq(messages.id, threadId), eq(messages.parentId, threadId)))
    .orderBy(asc(messages.createdAt));
  const root = rows.find((r) => r.id === threadId && r.parentId === null);
  if (!root) notFound();

  const staff = isStaff(me);
  const participant = rows.some((r) => r.senderId === me.id || r.recipientId === me.id);
  const canView = staff ? (root.recipientId === null || participant || me.role === "super_admin") : participant;
  if (!canView) redirect("/dashboard/messages?err=You+cannot+view+that+conversation.");

  await markThreadReadAction(threadId);

  // Reply goes to the other party: if I'm staff, reply to the student; if student, reply to original recipient (or all staff)
  const replyTo = root.senderId === me.id ? root.recipientId ?? "" : root.senderId;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={root.subject} subtitle={`Started by ${root.senderName} · ${fmtDate(root.createdAt)}`} action={<Link href="/dashboard/messages" className="btn-outline">← Inbox</Link>} />
      <Flash msg={msg} err={err} />
      <div className="space-y-3">
        {rows.map((m) => {
          const mine = m.senderId === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${mine ? "rounded-br-sm bg-[#0b4fb3] text-white" : "rounded-bl-sm border border-slate-200 bg-white"}`}>
                <p className={`text-xs font-semibold ${mine ? "text-blue-100" : "text-slate-500"}`}>{mine ? "You" : m.senderName} · {m.senderRole.replace("_", " ")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-blue-100" : "text-slate-400"}`}>{fmtDate(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form action={sendMessageAction} className="card mt-6 space-y-3">
        <input type="hidden" name="parentId" value={threadId} />
        <input type="hidden" name="recipientId" value={replyTo} />
        <input type="hidden" name="subject" value={`Re: ${root.subject}`} />
        <label className="label">Reply</label>
        <textarea name="body" required rows={4} className="input" placeholder="Type your reply..." />
        <div className="flex items-center justify-between">
          {(me.role === "super_admin" || root.senderId === me.id) && (
            <button formAction={deleteMessageAction} name="id" value={threadId} className="text-xs text-red-600 hover:underline" formNoValidate>Delete conversation</button>
          )}
          <button className="btn-primary ml-auto">Send Reply</button>
        </div>
      </form>
    </div>
  );
}
