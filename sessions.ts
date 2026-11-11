"use server";

import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { academicSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { go, str } from "./helpers";

const PAGE = "/dashboard/sessions";

/** Super Admin adds an academic session such as 2025/2026. */
export async function addSessionAction(formData: FormData) {
  const me = await requireUser(["super_admin"]);
  const name = str(formData, "name").replace(/\s+/g, "");
  const m = /^(\d{4})\/(\d{4})$/.exec(name);
  if (!m) go(PAGE, "Write the session as two years, e.g. 2025/2026.", "err");
  if (Number(m![2]) !== Number(m![1]) + 1) go(PAGE, "The second year must follow the first, e.g. 2025/2026.", "err");
  const [exists] = await db.select({ id: academicSessions.id }).from(academicSessions).where(eq(academicSessions.name, name)).limit(1);
  if (exists) go(PAGE, `Session ${name} already exists.`, "err");
  const makeCurrent = formData.get("current") === "on";
  const first = (await db.select({ id: academicSessions.id }).from(academicSessions).limit(1)).length === 0;
  if (makeCurrent || first) await db.update(academicSessions).set({ isCurrent: false });
  await db.insert(academicSessions).values({ name, isCurrent: makeCurrent || first, createdBy: me.id });
  go(PAGE, `Session ${name} added${makeCurrent || first ? " and set as the current session" : ""}.`);
}

export async function setCurrentSessionAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(academicSessions).where(eq(academicSessions.id, id)).limit(1);
  if (!row) go(PAGE, "Session not found.", "err");
  await db.update(academicSessions).set({ isCurrent: false }).where(ne(academicSessions.id, id));
  await db.update(academicSessions).set({ isCurrent: true }).where(eq(academicSessions.id, id));
  go(PAGE, `${row!.name} is now the current session.`);
}

export async function deleteSessionAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(academicSessions).where(eq(academicSessions.id, id)).limit(1);
  if (!row) go(PAGE, "Session not found.", "err");
  if (row!.isCurrent) go(PAGE, "The current session cannot be deleted. Make another session current first.", "err");
  await db.delete(academicSessions).where(eq(academicSessions.id, id));
  go(PAGE, `Session ${row!.name} deleted. Students already recorded under it keep that label.`);
}
