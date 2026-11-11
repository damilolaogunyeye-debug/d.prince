import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { aiConfig, askAI, jsonArray, PROVIDER_LABEL } from "@/lib/ai";

export const dynamic = "force-dynamic";

type GeneratedQuestion = { question: string; a: string; b: string; c: string; d: string; answer: string; marks: number };

const PROMPT = (topic: string, notes: string, count: number, level: string, difficulty: string) =>
  `You are an expert examiner. Generate ${count} multiple-choice CBT questions on the topic "${topic}" for ${level || "secondary/tertiary"} students. Difficulty: ${difficulty}.
${notes ? `Base the questions on these notes:\n${notes}\n` : ""}
Return ONLY a JSON array (no markdown) where each item is {"question": string, "a": string, "b": string, "c": string, "d": string, "answer": "A"|"B"|"C"|"D", "marks": 1}. Make distractors plausible and spread the correct answers across A-D.`;

// ---------- Offline assistant: builds questions from lesson notes / key facts ----------
function offlineGenerate(topic: string, notes: string, count: number): GeneratedQuestion[] {
  const sentences = notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 5);
  const stop = new Set(["the", "and", "that", "with", "from", "this", "which", "their", "there", "these", "those", "about", "into", "were", "have", "been", "also", "than", "when", "where", "while", "they", "them", "what", "will", "would", "could", "should", "because", "such", "each", "other", "some", "more", "most", "very", "over", "under", "between", "after", "before"]);
  const keyTerms = Array.from(
    new Set(
      notes
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !stop.has(w.toLowerCase())),
    ),
  );
  const out: GeneratedQuestion[] = [];
  const letters = ["A", "B", "C", "D"];

  for (const sentence of sentences) {
    if (out.length >= count) break;
    const words = sentence.replace(/[.!?]$/, "").split(" ");
    const candidates = words
      .map((w, i) => ({ w: w.replace(/[^a-zA-Z0-9-]/g, ""), i }))
      .filter(({ w }) => w.length > 4 && !stop.has(w.toLowerCase()));
    if (!candidates.length) continue;
    const pick = candidates[Math.floor(candidates.length / 2)];
    const blanked = words.map((w, i) => (i === pick.i ? "______" : w)).join(" ");
    const distractors = keyTerms
      .filter((t) => t.toLowerCase() !== pick.w.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    while (distractors.length < 3) distractors.push(["None of the above", "All of the above", "Not applicable"][distractors.length]);
    const options = [pick.w, ...distractors].sort(() => Math.random() - 0.5);
    const answerIdx = options.findIndex((o) => o === pick.w);
    out.push({
      question: `${topic ? `(${topic}) ` : ""}Fill in the blank: ${blanked}.`,
      a: options[0], b: options[1], c: options[2], d: options[3],
      answer: letters[answerIdx], marks: 1,
    });
  }

  // Generic prompts when there are no notes
  const generic = [
    { q: `Which of the following best describes the main idea of ${topic}?`, correct: `A core concept that explains ${topic}`, wrong: ["An unrelated historical event", "A type of measuring instrument", "A random guess without evidence"] },
    { q: `Which statement about ${topic} is TRUE?`, correct: `${topic} can be studied and applied systematically`, wrong: [`${topic} has no practical use`, `${topic} cannot be explained`, `${topic} is only a myth`] },
    { q: `The study of ${topic} is important because it`, correct: "helps us understand and solve related problems", wrong: ["has no real-world relevance", "replaces all other subjects", "is only for examinations"] },
    { q: `Which of these is most closely associated with ${topic}?`, correct: `Key principles of ${topic}`, wrong: ["Cooking recipes", "Traffic regulations", "Fashion trends"] },
    { q: `A student who wants to master ${topic} should first`, correct: "understand its basic definitions and principles", wrong: ["memorise unrelated facts", "avoid asking questions", "skip all practice exercises"] },
  ];
  let g = 0;
  while (out.length < count) {
    const item = generic[g % generic.length];
    const options = [item.correct, ...item.wrong].sort(() => Math.random() - 0.5);
    out.push({
      question: `${item.q}${g >= generic.length ? ` (variant ${Math.floor(g / generic.length) + 1})` : ""}`,
      a: options[0], b: options[1], c: options[2], d: options[3],
      answer: letters[options.indexOf(item.correct)], marks: 1,
    });
    g++;
  }
  return out.slice(0, count);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role === "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic || "").trim();
  const notes = String(body.notes || "").trim();
  const count = Math.min(50, Math.max(1, Number(body.count) || 10));
  const level = String(body.level || "");
  const difficulty = String(body.difficulty || "medium");
  if (!topic && !notes) return NextResponse.json({ error: "Provide a topic or paste lesson notes." }, { status: 400 });

  const prompt = PROMPT(topic, notes, count, level, difficulty);
  const cfg = await aiConfig();
  if (cfg) {
    try {
      const questions = jsonArray<GeneratedQuestion>(await askAI(cfg, prompt))
        .filter((q) => q && q.question && q.a && q.b && q.c && q.d)
        .map((q) => ({ ...q, answer: String(q.answer).toUpperCase().slice(0, 1), marks: Number(q.marks) || 1 }))
        .filter((q) => ["A", "B", "C", "D"].includes(q.answer));
      if (questions.length) return NextResponse.json({ provider: `${cfg.provider} (${cfg.model})`, questions });
      throw new Error("The AI returned no usable questions.");
    } catch (e) {
      // Say what happened instead of silently switching.
      return NextResponse.json({
        provider: "offline",
        warning: `The AI (${PROVIDER_LABEL[cfg.provider]}) did not work: ${(e as Error).message}. These are offline drafts instead.`,
        questions: offlineGenerate(topic || "the topic", notes, count),
      });
    }
  }
  return NextResponse.json({
    provider: "offline",
    warning: "No AI key is set up, so these come from the built-in offline generator (based on your notes). The Super Admin can add a key on the AI Assistant page.",
    questions: offlineGenerate(topic || "the topic", notes, count),
  });
}
