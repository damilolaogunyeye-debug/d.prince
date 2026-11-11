"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { go, str } from "./helpers";

const PAGE = "/dashboard/assignments";

/** Staff / Super Admin mark an assignment: a score out of a maximum, and optional feedback. */
export async function reviewAssignmentAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const feedback = str(formData, "feedback").slice(0, 2000) || null;
  const scoreRaw = str(formData, "score");
  const maxScore = Number(str(formData, "maxScore") || 100);
  if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) go(PAGE, "The maximum score must be a whole number from 1 to 1000.", "err");
  let score: number | null = null;
  if (scoreRaw !== "") {
    if (!/^\d+(\.\d{1,2})?$/.test(scoreRaw)) go(PAGE, "Write the score as a number, e.g. 15 or 15.5.", "err");
    score = Number(scoreRaw);
    if (score > maxScore) go(PAGE, `The score cannot be more than the maximum (${maxScore}).`, "err");
  }
  const [a] = await db.select({ id: assignments.id, title: assignments.title }).from(assignments).where(eq(assignments.id, id)).limit(1);
  if (!a) go(PAGE, "Assignment not found.", "err");
  await db.update(assignments).set({ status: "reviewed", score, maxScore, feedback, reviewedBy: me.id, reviewedAt: new Date() }).where(eq(assignments.id, id));
  go(PAGE, `"${a!.title}" marked${score !== null ? `: ${score}/${maxScore}` : ""}.`);
}

/** A student may withdraw their own upload until it is reviewed; the Super Admin may delete any. */
export async function deleteAssignmentAction(formData: FormData) {
  const me = await requireUser();
  const id = Number(formData.get("id"));
  const [a] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  if (!a) go(PAGE, "Assignment not found.", "err");
  const own = me.role === "student" && a!.studentId === me.id && a!.status === "submitted";
  if (!own && me.role !== "super_admin") go(PAGE, "This assignment can no longer be deleted.", "err");
  await db.delete(assignments).where(eq(assignments.id, id)); // the file row goes with it
  go(PAGE, `"${a!.title}" deleted.`);
}
