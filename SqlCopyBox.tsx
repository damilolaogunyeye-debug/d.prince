"use client";

import { useRef, useState } from "react";

/** Shows a script with a Copy button. It does not run anything. */
export function SqlCopyBox({ sql, rows = 16 }: { sql: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setStatus("copied");
    } catch {
      // Clipboard access is often blocked inside an embedded preview: select the text instead.
      ref.current?.focus();
      ref.current?.select();
      try {
        setStatus(document.execCommand("copy") ? "copied" : "manual");
      } catch {
        setStatus("manual");
      }
    }
    setTimeout(() => setStatus("idle"), 4000);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="btn-primary">
          {status === "copied" ? "Copied" : "Copy the whole script"}
        </button>
        <span className="text-xs text-slate-500">{sql.split("\n").length} lines</span>
        {status === "manual" && <span className="text-xs text-amber-700">Copy was blocked. The text is selected: press and hold, then choose Copy.</span>}
      </div>
      <textarea ref={ref} readOnly value={sql} rows={rows} spellCheck={false} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}
