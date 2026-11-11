"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const MAX = 8 * 1024 * 1024;

export function AssignmentUpload({ courses }: { courses: { id: number; label: string }[] }) {
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
    if (!(file instanceof File) || !file.name) return setError("Choose a PDF or Word (.docx) file.");
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError("Only PDF (.pdf) and Word (.docx) files are accepted.");
    if (file.size > MAX) return setError("The file is larger than 8 MB. Please upload a smaller file.");
    setBusy(true);
    try {
      const res = await fetch("/api/assignments", { method: "POST", body: fd, cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) setError(data.error || `Upload failed (HTTP ${res.status}). Please try again.`);
      else {
        setDone(`"${String(fd.get("title"))}" uploaded.`);
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setError("The server could not be reached. Check your connection and try again; nothing was uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card space-y-4">
      <h2 className="font-semibold">Upload an assignment</h2>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="a-title">Title *</label>
          <input id="a-title" name="title" required maxLength={200} className="input" placeholder="e.g. Week 3 Essay: Photosynthesis" />
        </div>
        <div>
          <label className="label" htmlFor="a-course">Course / subject</label>
          <select id="a-course" name="courseId" className="input" defaultValue="">
            <option value="">General (no specific course)</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {courses.length === 0 && <p className="mt-1 text-xs text-slate-500">Only courses approved for you are listed.</p>}
        </div>
        <div>
          <label className="label" htmlFor="a-file">File (PDF or DOCX, max 8 MB) *</label>
          <input id="a-file" name="file" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="a-note">Note to your teacher (optional)</label>
          <textarea id="a-note" name="note" rows={2} maxLength={2000} className="input" />
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Uploading..." : "Upload assignment"}</button>
    </form>
  );
}
