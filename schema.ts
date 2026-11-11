import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  customType,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Raw file bytes. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ---------- Users (super_admin | staff | student) ----------
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("student"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_username_idx").on(t.username),
  ],
);

// ---------- Login sessions ----------
// One row per signed-in device. Only a SHA-256 of the session token is stored, so
// reading this table does not let anyone sign in. Keeping sessions here (instead of
// a signed cookie) means sign-ins survive server restarts and need no secret key.
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

// ---------- Student profile (editable by the student) ----------
export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    admissionNo: varchar("admission_no", { length: 50 }),
    schoolName: varchar("school_name", { length: 200 }),
    classLevel: varchar("class_level", { length: 100 }),
    department: varchar("department", { length: 100 }),
    semester: varchar("semester", { length: 100 }),
    session: varchar("session", { length: 50 }),
    phone: varchar("phone", { length: 50 }),
    gender: varchar("gender", { length: 20 }),
    dateOfBirth: date("date_of_birth"),
    address: text("address"),
    guardianName: varchar("guardian_name", { length: 150 }),
    guardianPhone: varchar("guardian_phone", { length: 50 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("student_profiles_user_idx").on(t.userId)],
);

// ---------- Courses / Subjects ----------
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  classLevel: varchar("class_level", { length: 100 }),
  department: varchar("department", { length: 100 }),
  semester: varchar("semester", { length: 100 }),
  description: text("description"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Course registration (student requests, staff approves) ----------
export const courseRegistrations = pgTable(
  "course_registrations",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_reg_unique_idx").on(t.studentId, t.courseId)],
);

// ---------- CBT Tests ----------
export const tests = pgTable("tests", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  instructions: text("instructions"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
  // Exam focus: times a student may leave the test screen before it is submitted automatically (0 = never).
  maxLeaves: integer("max_leaves").notNull().default(3),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    testId: integer("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    optionA: text("option_a").notNull(),
    optionB: text("option_b").notNull(),
    optionC: text("option_c").notNull(),
    optionD: text("option_d").notNull(),
    correctOption: varchar("correct_option", { length: 1 }).notNull(), // A B C D
    marks: integer("marks").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("questions_test_idx").on(t.testId)],
);

export const testAttempts = pgTable(
  "test_attempts",
  {
    id: serial("id").primaryKey(),
    testId: integer("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"), // in_progress | submitted
    score: integer("score").notNull().default(0),
    totalMarks: integer("total_marks").notNull().default(0),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    leaveCount: integer("leave_count").notNull().default(0),
    leaveLog: jsonb("leave_log").$type<{ at: string; kind: string }[]>().notNull().default([]),
    autoSubmitted: boolean("auto_submitted").notNull().default(false),
  },
  (t) => [uniqueIndex("attempt_unique_idx").on(t.testId, t.studentId)],
);

// ---------- Notice board ----------
export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  audience: varchar("audience", { length: 20 }).notNull().default("all"), // all | students | staff
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Messages (student -> staff/admin and replies) ----------
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }), // null => all staff/admin
    subject: varchar("subject", { length: 200 }).notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    parentId: integer("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_recipient_idx").on(t.recipientId)],
);

// ---------- Attendance ----------
export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("present"), // present | absent | late | excused
    note: text("note"),
    markedBy: integer("marked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_unique_idx").on(t.studentId, t.date)],
);

// ---------- Promotion history ----------
export const promotionLogs = pgTable("promotion_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fromLevel: varchar("from_level", { length: 100 }),
  toLevel: varchar("to_level", { length: 100 }).notNull(),
  promotedBy: integer("promoted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Portal settings (local database only; e.g. the prepared Supabase connection) ----------
export const portalSettings = pgTable("portal_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Academic sessions (managed by the Super Admin) ----------
export const academicSessions = pgTable("academic_sessions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 20 }).notNull().unique(), // e.g. 2025/2026
  isCurrent: boolean("is_current").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Assignments uploaded by students (PDF / DOCX) ----------
export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    note: text("note"),
    session: varchar("session", { length: 20 }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 10 }).notNull(), // pdf | docx
    fileSize: integer("file_size").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("submitted"), // submitted | reviewed
    score: numeric("score", { precision: 6, scale: 2, mode: "number" }),
    maxScore: integer("max_score").notNull().default(100),
    feedback: text("feedback"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assignments_student_idx").on(t.studentId), index("assignments_course_idx").on(t.courseId)],
);

// The file itself, kept apart so lists never load file contents.
export const assignmentFiles = pgTable("assignment_files", {
  assignmentId: integer("assignment_id").primaryKey().references(() => assignments.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

// ---------- Course materials (handouts) uploaded by staff / Super Admin ----------
export const courseMaterials = pgTable("course_materials", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }), // null = for every student
  kind: varchar("kind", { length: 20 }).notNull().default("handout"), // handout | past_question
  examSession: varchar("exam_session", { length: 20 }), // past questions: e.g. 2023/2024
  examType: varchar("exam_type", { length: 60 }), // past questions: e.g. First Semester Exam
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  priceKobo: integer("price_kobo").notNull().default(0), // 0 = free
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 10 }).notNull(), // pdf | docx | pptx
  fileSize: integer("file_size").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseMaterialFiles = pgTable("course_material_files", {
  materialId: integer("material_id").primaryKey().references(() => courseMaterials.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

// ---------- Payments for materials: Paystack or bank transfer ----------
export const materialPayments = pgTable(
  "material_payments",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id").notNull().references(() => courseMaterials.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 20 }).notNull(), // paystack | bank_transfer
    amountKobo: integer("amount_kobo").notNull(),
    reference: varchar("reference", { length: 100 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | paid | failed | rejected
    paystackAccessCode: varchar("paystack_access_code", { length: 100 }),
    paystackAuthorizationUrl: text("paystack_authorization_url"),
    payerName: varchar("payer_name", { length: 150 }),
    payerBank: varchar("payer_bank", { length: 100 }),
    transferDate: date("transfer_date"),
    payerNote: text("payer_note"),
    proofFileName: varchar("proof_file_name", { length: 255 }),
    proofType: varchar("proof_type", { length: 10 }), // pdf | jpg | png
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("material_payments_student_idx").on(t.studentId),
    index("material_payments_material_idx").on(t.materialId),
    // A student can be recorded as having paid for a material only once.
    uniqueIndex("material_payments_one_paid_idx").on(t.materialId, t.studentId).where(sql`status = 'paid'`),
  ],
);

export const paymentProofs = pgTable("payment_proofs", {
  paymentId: integer("payment_id").primaryKey().references(() => materialPayments.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

// ---------- School-wide settings kept with the data (e.g. bank account for transfers) ----------
export const schoolSettings = pgTable("school_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type TestAttempt = typeof testAttempts.$inferSelect;
