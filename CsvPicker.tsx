"use client";

import { useState } from "react";

export function CsvPicker({ textareaName, placeholder }: { textareaName: string; placeholder?: string }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Choose a CSV / TXT file</label>
        <input
          type="file"
          accept=".csv,.txt"
          className="input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </div>
      <div>
        <label className="label">Or paste rows here</label>
        <textarea name={textareaName} value={text} onChange={(e) => setText(e.target.value)} rows={10} required className="input font-mono text-xs" placeholder={placeholder ?? "name,email,username,password,class,department"} />
      </div>
    </div>
  );
}
