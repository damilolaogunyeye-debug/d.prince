"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { attendance, messages, notices, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { go, num, opt, str } from "./helpers";

// =================== NOTICES ===================
export async function createNoticeAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const title = str(formData, "title");
  const body = str(formData, "body");
  if (!title || !body) go("/dashboard/notices", "Title and message are required.", "err");
  const audience = ["all", "students", "staff"].includes(str(formData, "audience")) ? str(formData, "audience") : "all";
  await db.insert(notices).values({ title, body, audience, createdBy: me.id });
  go("/dashboard/notices", "Notice published.");
}

export async function deleteNoticeAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  await db.delete(notices).where(eq(notices.id, num(formData, "id")));
  go("/dashboard/notices", "Notice deleted.");
}

// =================== MESSAGES ===================
export async function sendMessageAction(formData: FormData) {
  const me = await requireUser();
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  const recipientRaw = str(formData, "recipientId");
  const parentId = num(formData, "parentId") || null;
  if (!subject || !body) go("/dashboard/messages", "Subject and message are required.", "err");

  let recipientId: number | null = recipientRaw ? Number(recipientRaw) : null;
  if (me.role === "student" && recipientId) {
    // students may only message staff / admin
    const [r] = await db.select({ role: users.role }).from(users).where(eq(users.id, recipientId)).limit(1);
    if (!r || r.role === "student") recipientId = null;
  }
  await db.insert(messages).values({ senderId: me.id, recipientId, subject, body, parentId });
  go(parentId ? `/dashboard/messages/${parentId}` : "/dashboard/messages", "Message sent.");
}

export async function markThreadReadAction(threadId: number) {
  const me = await requireUser();
  const cond = me.role === "student" ? eq(messages.recipientId, me.id) : or(eq(messages.recipientId, me.id), isNull(messages.recipientId));
  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(or(eq(messages.id, threadId), eq(messages.parentId, threadId)), cond));
}

export async function deleteMessageAction(formData: FormData) {
  const me = await requireUser();
  const id = num(formData, "id");
  if (me.role === "super_admin") await db.delete(messages).where(or(eq(messages.id, id), eq(messages.parentId, id)));
  else await db.delete(messages).where(and(eq(messages.id, id), eq(messages.senderId, me.id)));
  go("/dashboard/messages", "Message deleted.");
}

// =================== ATTENDANCE ===================
export async function markAttendanceAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const date = str(formData, "date");
  if (!date) go("/dashboard/attendance", "Select a date.", "err");
  const ids = formData.getAll("studentIds").map(Number).filter(Boolean);
  let marked = 0;
  for (const id of ids) {
    const status = str(formData, `status_${id}`);
    if (!["present", "absent", "late", "excused"].includes(status)) continue;
    const note = opt(formData, `note_${id}`);
    await db
      .insert(attendance)
      .values({ studentId: id, date, status, note, markedBy: me.id })
      .onConflictDoUpdate({
        target: [attendance.studentId, attendance.date],
        set: { status, note, markedBy: me.id },
      });
    marked++;
  }
  go(`/dashboard/attendance?date=${date}`, `Attendance saved for ${marked} student(s) on ${date}.`);
}

export async function deleteAttendanceAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const ids = formData.getAll("ids").map(Number).filter(Boolean);
  if (ids.length) await db.delete(attendance).where(inArray(attendance.id, ids));
  go("/dashboard/attendance", "Attendance records removed.");
}
