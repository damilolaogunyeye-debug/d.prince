"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordLeaveAction, saveAnswersAction, submitTestAction } from "@/lib/actions/academics";

export type RunnerQuestion = { id: number; questionText: string; optionA: string; optionB: string; optionC: string; optionD: string; marks: number };

export function TestRunner({
  testId,
  title,
  courseLabel,
  questions,
  initialAnswers,
  deadlineMs,
  maxLeaves = 3,
  initialLeaves = 0,
}: {
  testId: number;
  title: string;
  courseLabel: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, string>;
  deadlineMs: number;
  maxLeaves?: number;
  initialLeaves?: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(Math.max(0, deadlineMs - Date.now()));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittedRef = useRef(false);

  const [submitProblem, setSubmitProblem] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitTestAction(testId, answersRef.current, auto);
      setSubmitting(false);
      if (res.ok && typeof res.score === "number") {
        setSubmitProblem(null);
        setResult({ score: res.score, total: res.total ?? 0 });
      } else {
        // The server answered but refused: retrying will not help.
        setSubmitProblem(res.error || "The server did not accept this submission.");
      }
    } catch {
      // No proper answer from the server (restarting, asleep, or no network).
      // Keep the answers on screen and keep trying until it gets through.
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitProblem("The server is not answering, so your test has not been submitted yet. Your answers are safe on this screen. Do not close or reload this page: it will keep trying every few seconds.");
      retryTimer.current = setTimeout(() => void submitRef.current(), 5000);
    }
  }, [testId]);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  // Countdown
  useEffect(() => {
    const tick = setInterval(() => {
      const left = deadlineMs - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(tick);
        submit();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [deadlineMs, submit]);

  // Autosave every 15s
  useEffect(() => {
    const save = setInterval(() => {
      if (!submittedRef.current) saveAnswersAction(testId, answersRef.current).catch(() => {});
    }, 15000);
    return () => clearInterval(save);
  }, [testId]);

  // Warn before leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ---------- Exam focus ----------
  // A website cannot stop a student minimising the browser or switching tabs. So the exam runs in
  // full screen, and every time the student leaves the exam screen it is recorded on the server.
  // Past the test's limit the test is submitted automatically.
  const [started, setStarted] = useState(false);
  const [fsAvailable, setFsAvailable] = useState(true);
  const [leaves, setLeaves] = useState(initialLeaves);
  const [away, setAway] = useState<string | null>(null);
  const awayRef = useRef(false);
  const startedRef = useRef(false);

  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      setFsAvailable(Boolean(document.fullscreenElement));
    } catch {
      setFsAvailable(false); // e.g. not allowed inside this frame: leaving is still recorded
    }
  }, []);

  async function begin() {
    await enterFullscreen();
    startedRef.current = true;
    setStarted(true);
    setAway(null);
  }

  const leave = useCallback(async (kind: string) => {
    if (!startedRef.current || submittedRef.current || awayRef.current) return;
    awayRef.current = true;
    setAway(kind);
    try {
      const r = await recordLeaveAction(testId, kind);
      if (r.ok) {
        setLeaves(r.count);
        if (r.mustSubmit) void submitRef.current(true);
      }
    } catch {
      // Could not record (server unreachable); the next leave will try again.
    }
  }, [testId]);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") void leave("tab_hidden"); };
    const onBlur = () => void leave("window_blur");
    const onFsChange = () => { if (!document.fullscreenElement && fsAvailable) void leave("left_fullscreen"); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [leave, fsAvailable]);

  async function backToExam() {
    if (fsAvailable) await enterFullscreen();
    awayRef.current = false;
    setAway(null);
  }

  useEffect(() => {
    if (result && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [result]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const answered = Object.keys(answers).filter((k) => answers[k]).length;
  const q = questions[current];

  if (result) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <div className="mx-auto max-w-lg">
        <div className="card text-center">
          <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white ${pct >= 50 ? "bg-emerald-500" : "bg-rose-500"}`}>{pct}%</div>
          <h2 className="mt-4 text-xl font-bold">Test Submitted</h2>
          <p className="mt-1 text-slate-600">{title}</p>
          <p className="mt-4 text-3xl font-bold text-[#0b4fb3]">{result.score} / {result.total}</p>
          <p className="text-sm text-slate-500">{answered} of {questions.length} questions answered</p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={() => router.push("/dashboard/results")} className="btn-primary">View My Results</button>
            <button onClick={() => router.push("/dashboard")} className="btn-outline">Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return <div className="card">This test has no questions.</div>;

  const left = maxLeaves > 0 ? Math.max(0, maxLeaves - leaves) : null;

  if (!started) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card space-y-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-slate-600">{courseLabel}</p>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This exam runs in full screen.</p>
            <p className="mt-1">Do not minimise the browser, switch to another tab or app, or leave full screen. Each time is recorded and shown to your teacher.</p>
            {maxLeaves > 0 && <p className="mt-1">You may leave the exam screen <b>{maxLeaves}</b> time(s). The next time, your test is <b>submitted automatically</b> with the answers you have given.</p>}
            {leaves > 0 && <p className="mt-1 font-semibold">You have already left the exam screen {leaves} time(s).</p>}
          </div>
          <button type="button" onClick={() => void begin()} className="btn-primary w-full">{leaves > 0 || answered > 0 ? "Return to the exam" : "Enter full screen and start"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {away && !submitting && (
        <div role="alertdialog" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/80 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-lg font-bold text-red-700">You left the exam screen</p>
            <p className="mt-2 text-sm text-slate-700">This has been recorded ({leaves} time{leaves === 1 ? "" : "s"}).</p>
            {left !== null && <p className="mt-1 text-sm font-semibold text-slate-900">{left > 0 ? `Leaving ${left} more time(s) is allowed. After that the test is submitted automatically.` : "Leaving again will submit your test automatically."}</p>}
            {!fsAvailable && <p className="mt-2 text-xs text-slate-500">Full screen is not available in this view; leaving the window is still recorded.</p>}
            <button type="button" onClick={() => void backToExam()} className="btn-primary mt-4 w-full">{fsAvailable ? "Return to full screen" : "Continue the exam"}</button>
          </div>
        </div>
      )}
      {/* Header bar */}
      <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0b4fb3] px-4 py-3 text-white shadow lg:top-2">
        <div>
          <p className="text-xs uppercase text-blue-100">{courseLabel}</p>
          <h1 className="font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm">Answered <b>{answered}</b>/{questions.length}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${leaves > 0 ? "bg-amber-400 text-amber-950" : "bg-white/15"}`} title="Times you left the exam screen">Left screen: {leaves}{maxLeaves > 0 ? `/${maxLeaves}` : ""}</span>
          <div className={`rounded-lg px-3 py-1.5 font-mono text-xl font-bold ${remaining < 60000 ? "animate-pulse bg-red-600" : "bg-white/15"}`}>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </div>
        </div>
      </div>

      {submitProblem && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Not submitted yet.</b> {submitProblem}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="card lg:col-span-3">
          <p className="text-xs font-semibold text-slate-400">Question {current + 1} of {questions.length} · {q.marks} mark(s)</p>
          <p className="mt-2 text-lg font-medium leading-relaxed">{q.questionText}</p>
          <div className="mt-4 space-y-2">
            {(["A", "B", "C", "D"] as const).map((o) => {
              const text = o === "A" ? q.optionA : o === "B" ? q.optionB : o === "C" ? q.optionC : q.optionD;
              const selected = answers[String(q.id)] === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [String(q.id)]: o }))}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${selected ? "border-[#0b4fb3] bg-blue-50 font-semibold text-[#0b4fb3]" : "border-slate-200 hover:border-slate-400"}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? "border-[#0b4fb3] bg-[#0b4fb3] text-white" : "border-slate-300"}`}>{o}</span>
                  {text}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="btn-outline">← Previous</button>
            <button type="button" onClick={() => setAnswers((a) => { const n = { ...a }; delete n[String(q.id)]; return n; })} className="text-xs text-slate-500 hover:underline">Clear answer</button>
            {current < questions.length - 1 ? (
              <button type="button" onClick={() => setCurrent((c) => c + 1)} className="btn-primary">Next →</button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="btn-success">Submit Test</button>
            )}
          </div>
        </div>

        <div className="card self-start">
          <p className="mb-2 text-sm font-semibold">Question Navigator</p>
          <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-4">
            {questions.map((qq, i) => (
              <button
                key={qq.id}
                type="button"
                onClick={() => setCurrent(i)}
                className={`h-9 rounded text-xs font-semibold ${i === current ? "ring-2 ring-[#0b4fb3]" : ""} ${answers[String(qq.id)] ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setConfirming(true)} disabled={submitting} className="btn-success mt-4 w-full">{submitting ? "Submitting..." : "Submit Test"}</button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Answers auto-save every 15s. The test auto-submits when time runs out.</p>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm">
            <h3 className="text-lg font-semibold">Submit test?</h3>
            <p className="mt-2 text-sm text-slate-600">You have answered {answered} of {questions.length} questions. You cannot change your answers after submitting.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="btn-outline">Go back</button>
              <button type="button" onClick={() => { setConfirming(false); submit(); }} className="btn-success">Yes, submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
