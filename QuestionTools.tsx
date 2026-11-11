"use client";

import { useState, useTransition } from "react";
import { importQuestionsAction, type ImportedQuestion } from "@/lib/actions/academics";
import { parseTypedQuestions } from "@/lib/question-parse";

type Tab = "ai" | "paste" | "check" | "import";
type Finding = { n: number | null; level: "problem" | "tip"; message: string };

export function QuestionTools({ testId, courseTitle, classLevel, aiStatus }: { testId: number; courseTitle: string; classLevel?: string | null; aiStatus?: string | null }) {
  const [warning, setWarning] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ count: number; findings: Finding[]; ai?: { provider: string; findings: Finding[] }; aiError?: string } | null>(null);

  function parseTyped() {
    setError(null);
    setWarning(null);
    const { questions, missing } = parseTypedQuestions(typed);
    if (!questions.length) {
      setError("No questions recognised. Number each question (1. 2. …) and put each option on its own line starting with A. B. C. D.");
      return;
    }
    setProvider("pasted text");
    setPreview(questions);
    const incomplete = questions.map((q, i) => (!q.c.trim() || !q.d.trim() ? i + 1 : 0)).filter(Boolean);
    const notes: string[] = [];
    if (missing.length) notes.push(`No answer was found for question(s) ${missing.join(", ")}; they are set to A.`);
    if (incomplete.length) notes.push(`Question(s) ${incomplete.join(", ")} have fewer than four options; fill in C and D.`);
    if (notes.length) setWarning(`${notes.join(" ")} Correct them below before adding.`);
  }

  async function runCheck(useAi: boolean) {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/review-questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testId, useAi }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setCheck(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  const [tab, setTab] = useState<Tab>("ai");
  const [preview, setPreview] = useState<ImportedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // AI form state
  const [topic, setTopic] = useState(courseTitle);
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  // Import state
  const [raw, setRaw] = useState("");

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, notes, count, difficulty, level: classLevel ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setPreview(data.questions);
      setProvider(data.provider);
      setWarning(data.warning ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function parseImport() {
    setError(null);
    const text = raw.trim();
    if (!text) return;
    try {
      if (text.startsWith("[")) {
        const arr = JSON.parse(text) as Record<string, unknown>[];
        setPreview(
          arr.map((q) => ({
            question: String(q.question ?? q.q ?? ""),
            a: String(q.a ?? q.optionA ?? q.A ?? ""), b: String(q.b ?? q.optionB ?? q.B ?? ""),
            c: String(q.c ?? q.optionC ?? q.C ?? ""), d: String(q.d ?? q.optionD ?? q.D ?? ""),
            answer: String(q.answer ?? q.correct ?? "A").toUpperCase(), marks: Number(q.marks ?? 1) || 1,
          })),
        );
        return;
      }
      // CSV: question,optionA,optionB,optionC,optionD,answer,marks
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const parsed: ImportedQuestion[] = [];
      for (const line of lines) {
        const cells = splitCsv(line);
        if (cells.length < 6 || cells[0].toLowerCase() === "question") continue;
        parsed.push({ question: cells[0], a: cells[1], b: cells[2], c: cells[3], d: cells[4], answer: cells[5].toUpperCase(), marks: Number(cells[6]) || 1 });
      }
      setPreview(parsed);
      if (!parsed.length) setError("No rows recognised. Use: question,optionA,optionB,optionC,optionD,answer,marks");
    } catch {
      setError("Could not parse the pasted content.");
    }
  }

  function update(i: number, key: keyof ImportedQuestion, value: string) {
    setPreview((p) => p.map((q, idx) => (idx === i ? { ...q, [key]: key === "marks" ? Number(value) : value } : q)));
  }

  function save() {
    const fd = new FormData();
    fd.set("testId", String(testId));
    fd.set("payload", JSON.stringify(preview));
    startTransition(async () => {
      await importQuestionsAction(fd);
    });
  }

  return (
    <div className="card">
      <div className="mb-4 flex gap-2 border-b border-slate-100">
        <button type="button" onClick={() => setTab("ai")} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "ai" ? "border-[#0b4fb3] text-[#0b4fb3]" : "border-transparent text-slate-500"}`}>✨ AI Question Assistant</button>
        <button type="button" onClick={() => setTab("paste")} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "paste" ? "border-[#0b4fb3] text-[#0b4fb3]" : "border-transparent text-slate-500"}`}>📋 Paste typed questions</button>
        <button type="button" onClick={() => setTab("check")} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "check" ? "border-[#0b4fb3] text-[#0b4fb3]" : "border-transparent text-slate-500"}`}>🔍 Check questions</button>
        <button type="button" onClick={() => setTab("import")} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "import" ? "border-[#0b4fb3] text-[#0b4fb3]" : "border-transparent text-slate-500"}`}>⬆ Import (CSV / JSON)</button>
      </div>

      {tab === "ai" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className="label">Topic</label><input value={topic} onChange={(e) => setTopic(e.target.value)} className="input" placeholder="e.g. Photosynthesis" /></div>
            <div><label className="label">Number of questions</label><input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} className="input" /></div>
            <div><label className="label">Difficulty</label><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
            <div className="sm:col-span-3"><label className="label">Lesson notes / source text (optional, improves quality)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="input" placeholder="Paste lesson notes, textbook passage or key facts here..." /></div>
          </div>
          <button type="button" onClick={generate} disabled={loading} className="btn-primary">{loading ? "Generating..." : "Generate Questions"}</button>
          <p className="text-xs text-slate-500">{aiStatus ? <>AI is on ({aiStatus}). Drafts are shown for checking before anything is added.</> : <>No AI key is set up, so drafts come from the offline generator (based on your notes). The Super Admin can add a key on the AI Assistant page.</>}</p>
        </div>
      ) : tab === "paste" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Paste questions typed from a past paper or a document. Number each question; put options on their own lines (A. B. C. D.); mark the answer with a line like <code>Answer: C</code>, a <code>*</code> on the right option, or an answer key at the end (&ldquo;Answers&rdquo; then <code>1. C</code>, <code>2. A</code> …).</p>
          <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={9} className="input font-mono text-xs" placeholder={"1. What is the capital of Nigeria?\nA. Lagos\nB. Abuja\nC. Kano\nD. Ibadan\nAnswer: B\n\n2. 5 x 6 = ?\nA. 11\nB. 30*\nC. 56\nD. 1"} />
          <button type="button" onClick={parseTyped} className="btn-primary">Turn into questions</button>
        </div>
      ) : tab === "check" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Checks this test&apos;s saved questions for duplicates, identical or empty options, answers that give themselves away, and lopsided answer letters.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runCheck(false)} disabled={checking} className="btn-outline">{checking ? "Checking…" : "Quick check (no AI)"}</button>
            <button type="button" onClick={() => void runCheck(true)} disabled={checking || !aiStatus} className="btn-primary" title={aiStatus ? "" : "Needs an AI key"}>{checking ? "Checking…" : "Check with AI (are the answers right?)"}</button>
          </div>
          {!aiStatus && <p className="text-xs text-slate-500">The AI check needs an AI key (Super Admin → AI Assistant).</p>}
          {check && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">{check.count} question(s) checked.</p>
              {check.findings.length === 0 ? <p className="rounded bg-emerald-50 p-2 text-emerald-800">Quick check: no problems found.</p> : (
                <ul className="space-y-1">{check.findings.map((f, i) => <li key={i} className={`rounded p-2 ${f.level === "problem" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{f.n ? <b>Question {f.n}: </b> : <b>All questions: </b>}{f.message}</li>)}</ul>
              )}
              {check.aiError && <p className="rounded bg-red-50 p-2 text-red-800">{check.aiError}</p>}
              {check.ai && (check.ai.findings.length === 0 ? <p className="rounded bg-emerald-50 p-2 text-emerald-800">AI review ({check.ai.provider}): no problems found.</p> : (
                <div><p className="font-semibold">AI review ({check.ai.provider}) — check each point yourself:</p>
                  <ul className="mt-1 space-y-1">{check.ai.findings.map((f, i) => <li key={i} className="rounded bg-blue-50 p-2 text-blue-900">{f.n ? <b>Question {f.n}: </b> : null}{f.message}</li>)}</ul></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">CSV format: <code>question,optionA,optionB,optionC,optionD,answer,marks</code> (answer = A/B/C/D). JSON array of {"{question,a,b,c,d,answer,marks}"} also accepted.</p>
          <input type="file" accept=".csv,.txt,.json" className="input" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw(await f.text()); }} />
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} className="input font-mono text-xs" placeholder={'What is 2+2?,3,4,5,6,B,1\n"Capital of Nigeria?",Lagos,Abuja,Kano,Ibadan,B,1'} />
          <button type="button" onClick={parseImport} className="btn-primary">Preview Import</button>
        </div>
      )}

      {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {warning && preview.length > 0 && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900">{warning}</p>}

      {preview.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Preview ({preview.length}) {provider && <span className="badge-gray ml-2">source: {provider}</span>}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPreview([])} className="btn-outline btn-sm">Clear</button>
              <button type="button" onClick={save} disabled={pending} className="btn-success btn-sm">{pending ? "Saving..." : `Add ${preview.length} to Test`}</button>
            </div>
          </div>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {preview.map((q, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-bold text-slate-400">{i + 1}.</span>
                  <textarea value={q.question} onChange={(e) => update(i, "question", e.target.value)} rows={2} className="input" />
                  <button type="button" onClick={() => setPreview((p) => p.filter((_, idx) => idx !== i))} className="mt-1 text-slate-400 hover:text-red-600" title="Remove">✕</button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(["a", "b", "c", "d"] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className={`w-5 text-xs font-bold ${q.answer === k.toUpperCase() ? "text-emerald-600" : "text-slate-400"}`}>{k.toUpperCase()}</span>
                      <input value={q[k]} onChange={(e) => update(i, k, e.target.value)} className="input py-1 text-xs" />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <label>Answer <select value={q.answer} onChange={(e) => update(i, "answer", e.target.value)} className="input ml-1 inline w-16 py-1 text-xs">{["A", "B", "C", "D"].map((o) => <option key={o}>{o}</option>)}</select></label>
                  <label>Marks <input type="number" min={1} value={q.marks ?? 1} onChange={(e) => update(i, "marks", e.target.value)} className="input ml-1 inline w-16 py-1 text-xs" /></label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
