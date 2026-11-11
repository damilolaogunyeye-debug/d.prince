import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { questions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { aiConfig, askAI, jsonArray, PROVIDER_LABEL } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Q = typeof questions.$inferSelect;
export type Finding = { n: number | null; level: "problem" | "tip"; message: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Checks that need no AI: duplicates, identical options, giveaway answers, answer-letter balance. */
function offlineChecks(qs: Q[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, number>();
  qs.forEach((q, i) => {
    const n = i + 1;
    const opts = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>;
    const key = norm(q.questionText);
    if (seen.has(key)) out.push({ n, level: "problem", message: `Same question as number ${seen.get(key)}.` });
    else seen.set(key, n);
    if (q.questionText.trim().length < 8) out.push({ n, level: "problem", message: "The question is very short or empty." });
    if (!["A", "B", "C", "D"].includes(q.correctOption)) out.push({ n, level: "problem", message: `The correct answer is "${q.correctOption}", which is not A, B, C or D.` });
    const vals = Object.values(opts).map(norm);
    if (new Set(vals).size < vals.length) out.push({ n, level: "problem", message: "Two or more options are the same." });
    if (vals.some((v) => !v)) out.push({ n, level: "problem", message: "An option is empty." });
    for (const [letter, text] of Object.entries(opts)) {
      if (/\b(all|none) of the above\b/i.test(text) && letter !== "D") out.push({ n, level: "tip", message: `"${text.trim()}" is in option ${letter}; it reads best as the last option (D).` });
    }
    const correct = opts[q.correctOption] ?? "";
    const others = Object.entries(opts).filter(([l]) => l !== q.correctOption).map(([, t]) => t.length);
    const avg = others.reduce((s, x) => s + x, 0) / Math.max(1, others.length);
    if (correct.length > 20 && correct.length > avg * 1.8 && others.every((l) => l < correct.length)) {
      out.push({ n, level: "tip", message: "The correct option is much longer than the others, which can give the answer away." });
    }
  });
  if (qs.length >= 8) {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    qs.forEach((q) => { if (q.correctOption in counts) counts[q.correctOption]++; });
    const [top, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (c / qs.length > 0.5) out.push({ n: null, level: "tip", message: `${c} of ${qs.length} answers are "${top}". Spread the correct answers across A–D so guessing one letter does not pay.` });
  }
  return out;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role === "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { testId?: number; useAi?: boolean };
  const qs = await db.select().from(questions).where(eq(questions.testId, Number(body.testId))).orderBy(asc(questions.sortOrder), asc(questions.id));
  if (!qs.length) return NextResponse.json({ count: 0, findings: [] });
  const findings = offlineChecks(qs);

  let ai: { provider: string; findings: Finding[] } | undefined;
  let aiError: string | undefined;
  if (body.useAi) {
    const cfg = await aiConfig();
    if (!cfg) aiError = "No AI key is set up. The Super Admin can add one on the AI Assistant page.";
    else {
      const list = qs.slice(0, 60).map((q, i) => `${i + 1}. ${q.questionText}\nA. ${q.optionA}\nB. ${q.optionB}\nC. ${q.optionC}\nD. ${q.optionD}\nMarked answer: ${q.correctOption}`).join("\n\n");
      const prompt = `You are checking multiple-choice exam questions written by a teacher. For each question, check whether the marked answer is actually correct, whether more than one option could be correct, whether the question is unclear, and any factual or spelling errors.\nReturn ONLY a JSON array (no markdown) with one item per question that has a problem: {"n": number, "problem": string, "suggestion": string}. Return [] if all are fine.\n\n${list}`;
      try {
        const items = jsonArray<{ n: number; problem: string; suggestion?: string }>(await askAI(cfg, prompt));
        ai = {
          provider: `${PROVIDER_LABEL[cfg.provider]} (${cfg.model})`,
          findings: items.filter((x) => x && x.problem).map((x) => ({ n: Number(x.n) || null, level: "problem" as const, message: `${x.problem}${x.suggestion ? ` Suggestion: ${x.suggestion}` : ""}` })),
        };
      } catch (e) {
        aiError = `The AI review did not work: ${(e as Error).message}`;
      }
    }
  }
  return NextResponse.json({ count: qs.length, findings, ai, aiError, reviewedByAiUpTo: Math.min(qs.length, 60) });
}
