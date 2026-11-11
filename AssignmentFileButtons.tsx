"use client";

import { useState } from "react";

/**
 * Fetches the file with the page's own request (so it works whether the session
 * is a cookie or the cookie-less header), then opens or saves it.
 */
export function AssignmentFileButtons({ id, fileName, fileType, url: fileUrl, label = "Download" }: { id: number; fileName: string; fileType: string; url?: string; label?: string }) {
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function get(kind: "view" | "download") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(fileUrl ?? `/api/assignments/${id}/file`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      let opened = false;
      if (kind === "view") opened = Boolean(window.open(url, "_blank", "noopener"));
      if (!opened) {
        // Saving also works where new tabs are blocked (e.g. inside the preview frame).
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(`Could not open the file: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fileType === "pdf" && (
        <button type="button" onClick={() => get("view")} disabled={busy !== null} className="btn-outline px-2 py-1 text-xs">
          {busy === "view" ? "Opening..." : "View"}
        </button>
      )}
      <button type="button" onClick={() => get("download")} disabled={busy !== null} className="btn-outline px-2 py-1 text-xs">
        {busy === "download" ? "Downloading..." : label}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
