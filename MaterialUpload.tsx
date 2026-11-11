"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const MAX = 8 * 1024 * 1024;

export function MaterialUpload({ courses, kind = "handout" }: { courses: { id: number; label: string }[]; kind?: "handout" | "past_question" }) {
  const pq = kind === "past_question";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.name) return setError("Choose the handout file.");
    if (!/\.(pdf|docx|pptx)$/i.test(file.name)) return setError("Only PDF (.pdf), Word (.docx) and PowerPoint (.pptx) files are accepted.");
    if (file.size > MAX) return setError("The file is larger than 8 MB. Please upload a smaller file.");
    setBusy(true);
    try {
      const res = await fetch("/api/materials", { method: "POST", body: fd, cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) setError(data.error || `Upload failed (HTTP ${res.status}).`);
      else {
        setDone(`"${String(fd.get("title"))}" uploaded.`);
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setError("The server could not be reached. Nothing was uploaded; please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card mb-6 space-y-4">
      <h2 className="font-semibold">{pq ? "Upload a past question paper" : "Upload a course material (handout)"}</h2>
      <input type="hidden" name="kind" value={kind} />
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="m-title">Title *</label><input id="m-title" name="title" required maxLength={200} className="input" placeholder={pq ? "e.g. MTH101 Past Questions" : "e.g. MTH101 Handout: Algebra"} /></div>
        {pq && (
          <>
            <div><label className="label" htmlFor="m-sess">Exam session</label><input id="m-sess" name="examSession" maxLength={20} className="input" placeholder="e.g. 2023/2024" /></div>
            <div><label className="label" htmlFor="m-type">Exam type</label><input id="m-type" name="examType" maxLength={60} className="input" placeholder="e.g. First Semester Exam" /></div>
          </>
        )}
        <div>
          <label className="label" htmlFor="m-course">Course / subject</label>
          <select id="m-course" name="courseId" defaultValue="" className="input">
            <option value="">All students (no specific course)</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">With a course chosen, only students approved for it see the material.</p>
        </div>
        <div>
          <label className="label" htmlFor="m-price">Price in naira (₦) *</label>
          <input id="m-price" name="price" required inputMode="decimal" defaultValue="0" className="input" />
          <p className="mt-1 text-xs text-slate-500">0 = free. Paid materials cost at least ₦100.</p>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="m-file">File (PDF, DOCX or PPTX, max 8 MB) *</label><input id="m-file" name="file" type="file" required accept=".pdf,.docx,.pptx" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="m-desc">Description (optional)</label><textarea id="m-desc" name="description" rows={2} maxLength={2000} className="input" /></div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Uploading..." : "Upload material"}</button>
    </form>
  );
}
