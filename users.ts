"use server";

import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { academicSessions, promotionLogs, studentProfiles, users } from "@/db/schema";
import { nextClassLevel } from "@/lib/queries";
import { hashPassword, requireUser, revokeSessions } from "@/lib/auth";
import { go, opt, str } from "./helpers";

async function identifierTaken(email: string, username: string) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .limit(1);
  return Boolean(existing);
}

// ---------- Register a student (staff or super admin) ----------
export async function registerStudentAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const username = str(formData, "username").toLowerCase();
  const password = str(formData, "password") || "student123";
  if (!name || !email || !username) go("/dashboard/students", "Name, email and username are required.", "err");
  if (await identifierTaken(email, username)) go("/dashboard/students", "Email or username already exists.", "err");

  const [created] = await db
    .insert(users)
    .values({ name, email, username, passwordHash: hashPassword(password), role: "student", createdBy: me.id })
    .returning({ id: users.id });

  await db.insert(studentProfiles).values({
    userId: created.id,
    admissionNo: opt(formData, "admissionNo") ?? `DP/${new Date().getFullYear()}/${String(created.id).padStart(4, "0")}`,
    schoolName: opt(formData, "schoolName"),
    classLevel: opt(formData, "classLevel"),
    department: opt(formData, "department"),
    semester: opt(formData, "semester"),
    gender: opt(formData, "gender"),
    phone: opt(formData, "phone"),
  });
  go("/dashboard/students", `Student ${name} registered. Login: ${username} / ${password}`);
}

// ---------- Bulk upload students (CSV lines: name,email,username,password,class,department) ----------
export async function bulkRegisterStudentsAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const raw = str(formData, "csv");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const [name, email, username, password, classLevel, department] = line.split(",").map((s) => s?.trim() ?? "");
    if (!name || !email || !username || name.toLowerCase() === "name") { skipped++; continue; }
    if (await identifierTaken(email.toLowerCase(), username.toLowerCase())) { skipped++; continue; }
    const [created] = await db
      .insert(users)
      .values({ name, email: email.toLowerCase(), username: username.toLowerCase(), passwordHash: hashPassword(password || "student123"), role: "student", createdBy: me.id })
      .returning({ id: users.id });
    await db.insert(studentProfiles).values({
      userId: created.id,
      admissionNo: `DP/${new Date().getFullYear()}/${String(created.id).padStart(4, "0")}`,
      classLevel: classLevel || null,
      department: department || null,
    });
    added++;
  }
  go("/dashboard/students", `Bulk upload complete: ${added} added, ${skipped} skipped.`);
}

// ---------- Add staff (super admin only) ----------
export async function addStaffAction(formData: FormData) {
  const me = await requireUser(["super_admin"]);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const username = str(formData, "username").toLowerCase();
  const password = str(formData, "password") || "staff123";
  const role = str(formData, "role") === "super_admin" ? "super_admin" : "staff";
  if (!name || !email || !username) go("/dashboard/staff", "Name, email and username are required.", "err");
  if (await identifierTaken(email, username)) go("/dashboard/staff", "Email or username already exists.", "err");
  await db.insert(users).values({ name, email, username, passwordHash: hashPassword(password), role, createdBy: me.id });
  go("/dashboard/staff", `${name} added as ${role === "super_admin" ? "Super Admin" : "Staff"}. Login: ${username} / ${password}`);
}

// ---------- Remove users ----------
export async function removeUserAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) go("/dashboard", "User not found.", "err");
  if (target.id === me.id) go("/dashboard", "You cannot remove your own account.", "err");
  const back = target.role === "student" ? "/dashboard/students" : "/dashboard/staff";
  if (target.role !== "student" && me.role !== "super_admin") go(back, "Only the Super Admin can remove staff.", "err");
  await db.delete(users).where(eq(users.id, id));
  go(back, `${target.name} has been removed from the portal.`);
}

export async function toggleActiveAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.id === me.id) go("/dashboard", "Action not allowed.", "err");
  if (target.role !== "student" && me.role !== "super_admin") go("/dashboard/staff", "Only the Super Admin can manage staff.", "err");
  await db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, id));
  go(target.role === "student" ? "/dashboard/students" : "/dashboard/staff", `${target.name} is now ${target.isActive ? "deactivated" : "active"}.`);
}

export async function resetPasswordAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const password = str(formData, "password") || "password123";
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) go("/dashboard", "User not found.", "err");
  if (target.role !== "student" && me.role !== "super_admin") go("/dashboard/staff", "Only the Super Admin can reset staff passwords.", "err");
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, id));
  await revokeSessions(id);
  go(target.role === "student" ? "/dashboard/students" : "/dashboard/staff", `Password for ${target.name} reset to: ${password}`);
}

// ---------- Promote / change class ----------
// mode "next": every selected student moves to the class after their current one.
// mode "specific": every selected student moves to the chosen class (or Graduated).
// session: optional; when chosen, the students' academic session is updated too.
export async function promoteStudentAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const PAGE = "/dashboard/students/promotion";
  const ids = formData.getAll("studentIds").map(Number).filter(Boolean);
  const mode = str(formData, "mode") === "specific" ? "specific" : "next";
  const chosen = str(formData, "toLevel");
  const session = str(formData, "session");
  if (!ids.length) go(PAGE, "Select at least one student.", "err");
  if (mode === "specific" && !chosen) go(PAGE, "Choose the class to move the students to.", "err");
  if (session) {
    const [ok] = await db.select({ id: academicSessions.id }).from(academicSessions).where(eq(academicSessions.name, session)).limit(1);
    if (!ok) go(PAGE, "That session does not exist. The Super Admin can add it under Academic Sessions.", "err");
  }

  let moved = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const [student] = await db.select({ name: users.name }).from(users).where(and(eq(users.id, id), eq(users.role, "student"))).limit(1);
    if (!student) continue;
    const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, id)).limit(1);
    const from = profile?.classLevel ?? null;
    const to = mode === "next" ? nextClassLevel(from) : chosen;
    if (!to) {
      skipped.push(`${student.name} (${from ?? "no class"})`);
      continue;
    }
    if (profile) {
      await db.update(studentProfiles).set({ classLevel: to, ...(session ? { session } : {}), updatedAt: new Date() }).where(eq(studentProfiles.userId, id));
    } else {
      await db.insert(studentProfiles).values({ userId: id, classLevel: to, session: session || null });
    }
    await db.insert(promotionLogs).values({ studentId: id, fromLevel: from, toLevel: to, promotedBy: me.id });
    moved++;
  }
  const parts = [`${moved} student(s) ${mode === "next" ? "moved to their next class" : `moved to ${chosen}`}${session && moved ? ` for session ${session}` : ""}.`];
  if (skipped.length) parts.push(`Not moved (final class or no class on record, choose a class for them instead): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? " …" : ""}.`);
  go(PAGE, parts.join(" "), moved ? "ok" : "err");
}

// ---------- Student edits own profile ----------
export async function updateMyProfileAction(formData: FormData) {
  const me = await requireUser();
  const values = {
    schoolName: opt(formData, "schoolName"),
    classLevel: opt(formData, "classLevel"),
    department: opt(formData, "department"),
    semester: opt(formData, "semester"),
    session: opt(formData, "session"),
    phone: opt(formData, "phone"),
    gender: opt(formData, "gender"),
    dateOfBirth: opt(formData, "dateOfBirth"),
    address: opt(formData, "address"),
    guardianName: opt(formData, "guardianName"),
    guardianPhone: opt(formData, "guardianPhone"),
    updatedAt: new Date(),
  };
  const name = str(formData, "name");
  if (name) await db.update(users).set({ name }).where(eq(users.id, me.id));
  const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, me.id)).limit(1);
  if (existing) await db.update(studentProfiles).set(values).where(eq(studentProfiles.userId, me.id));
  else await db.insert(studentProfiles).values({ userId: me.id, ...values });
  go("/dashboard/profile", "Profile information saved.");
}

// ---------- Staff edits a student profile ----------
export async function updateStudentByStaffAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const values = {
    admissionNo: opt(formData, "admissionNo"),
    schoolName: opt(formData, "schoolName"),
    classLevel: opt(formData, "classLevel"),
    department: opt(formData, "department"),
    semester: opt(formData, "semester"),
    updatedAt: new Date(),
  };
  const name = str(formData, "name");
  if (name) await db.update(users).set({ name }).where(and(eq(users.id, id), eq(users.role, "student")));
  const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, id)).limit(1);
  if (existing) await db.update(studentProfiles).set(values).where(eq(studentProfiles.userId, id));
  else await db.insert(studentProfiles).values({ userId: id, ...values });
  go(`/dashboard/students/${id}`, "Student information updated.");
}
