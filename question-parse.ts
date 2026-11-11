/** Same shape as ImportedQuestion in the CBT import action. */
export type ParsedQuestion = { question: string; a: string; b: string; c: string; d: string; answer: string; marks: number };

/**
 * Turns questions typed from a past paper or document into CBT questions. Understands:
 *   1. Question text          (also "1)", "Q1.", "Question 1:")
 *   A. option   (also "A)", "(a)", "a.")   — an option starting or ending with * is the answer
 *   Answer: C   (also "Ans: C", "Correct answer - C")
 * and an answer key at the end:  "Answers"  then lines like "1. C", "2-B", "3) A".
 */
export function parseTypedQuestions(text: string): { questions: ParsedQuestion[]; missing: number[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  type Draft = { q: string; opts: Record<string, string>; answer: string; last: string | null };
  const drafts: Draft[] = [];
  const key: Record<number, string> = {};
  let cur: Draft | null = null;
  let inKey = false;
  const qRe = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s*(.+)$/i;
  const oRe = /^\s*\(?([a-dA-D])\s*[.)\]:\-]\s*(.+)$/;
  const aRe = /^\s*(?:ans(?:wer)?|correct(?:\s+answer)?|key)\s*[:=\-]?\s*\(?([a-dA-D])\)?\s*\.?\s*$/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(answers?|answer key|marking (scheme|key))\s*:?\s*$/i.test(line)) { inKey = true; continue; }
    if (inKey) {
      for (const m of line.matchAll(/(\d{1,3})\s*[.):\-]?\s*([a-dA-D])\b/g)) key[Number(m[1])] = m[2].toUpperCase();
      continue;
    }
    const am = aRe.exec(line);
    if (am && cur) { cur.answer = am[1].toUpperCase(); continue; }
    const om = oRe.exec(line);
    if (om && cur) {
      const letter = om[1].toUpperCase();
      let t = om[2].trim();
      if (/^\*|\*$/.test(t)) { cur.answer = letter; t = t.replace(/^\*\s*|\s*\*$/g, ""); }
      cur.opts[letter] = t;
      cur.last = letter;
      continue;
    }
    const qm = qRe.exec(line);
    if (qm) {
      cur = { q: qm[2].trim(), opts: {}, answer: "", last: null };
      drafts.push(cur);
      continue;
    }
    if (cur) {
      if (cur.last) cur.opts[cur.last] += " " + line; // continuation of an option
      else cur.q += " " + line; // continuation of the question
    }
  }
  const questions: ParsedQuestion[] = [];
  const missing: number[] = [];
  drafts.forEach((d, i) => {
    if (!d.opts.A || !d.opts.B) return; // not a multiple-choice question
    const answer = d.answer || key[i + 1] || "";
    if (!answer) missing.push(questions.length + 1);
    questions.push({ question: d.q, a: d.opts.A, b: d.opts.B, c: d.opts.C ?? "", d: d.opts.D ?? "", answer: answer || "A", marks: 1 });
  });
  return { questions, missing };
}

