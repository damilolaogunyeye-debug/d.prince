import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterialFiles, courseMaterials, courses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { MAX_ASSIGNMENT_BYTES, detectFileType, safeFileName } from "@/lib/assignment-files";
import { MAX_PRICE_KOBO, MIN_PRICE_KOBO, parseNaira } from "@/lib/payments";
import { logEvent } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/** Staff / Super Admin upload a handout (PDF, DOCX or PPTX, up to 8 MB) with a price (0 = free). */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return fail("Your session has ended. Please sign in again.", 401);
  if (me.role !== "staff" && me.role !== "super_admin") return fail("Only staff and the Super Admin can upload course materials.", 403);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("The upload could not be read. If the file is larger than 8 MB, please make it smaller.");
  }
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const description = String(form.get("description") ?? "").trim().slice(0, 2000) || null;
  const courseId = Number(form.get("courseId") ?? 0) || null;
  const price = parseNaira(String(form.get("price") ?? ""));
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "handout") === "past_question" ? "past_question" : "handout";
  const examSession = kind === "past_question" ? String(form.get("examSession") ?? "").trim().slice(0, 20) || null : null;
  const examType = kind === "past_question" ? String(form.get("examType") ?? "").trim().slice(0, 60) || null : null;
  if (!title) return fail("Give the material a title.");
  if (price === null) return fail("Write the price as a number of naira, e.g. 1500 (or 0 for free).");
  if (price > 0 && price < MIN_PRICE_KOBO) return fail("A paid material must cost at least ₦100. Use 0 to make it free.");
  if (price > MAX_PRICE_KOBO) return fail("That price is too high.");
  if (courseId) {
    const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!c) return fail("That course does not exist.");
  }
  if (!(file instanceof File) || file.size === 0) return fail("Choose the handout file (PDF, Word .docx or PowerPoint .pptx).");
  if (file.size > MAX_ASSIGNMENT_BYTES) return fail("The file is larger than 8 MB. Please upload a smaller file.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(file.name, bytes, ["pdf", "docx", "pptx"]);
  if (!type) return fail("Only PDF (.pdf), Word (.docx) and PowerPoint (.pptx) files are accepted, and the file must really be in that format.");
  try {
    const [row] = await db
      .insert(courseMaterials)
      .values({ courseId, kind, examSession, examType, title, description, priceKobo: price, fileName: safeFileName(file.name), fileType: type, fileSize: bytes.length, uploadedBy: me.id })
      .returning({ id: courseMaterials.id });
    try {
      await db.insert(courseMaterialFiles).values({ materialId: row.id, data: bytes });
    } catch (e) {
      await db.delete(courseMaterials).where(eq(courseMaterials.id, row.id));
      throw e;
    }
    return NextResponse.json({ ok: true, id: row.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logEvent("server-error", { name: (e as Error).name, message: (e as Error).message, path: "/api/materials" });
    return fail("The material could not be saved. Please try again.", 500);
  }
}
