"use client";

import "./globals.css";
import { PortalError } from "@/components/Recovery";

// Last-resort boundary: used when the root layout itself fails. It replaces the whole
// document, so it must render its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <PortalError error={error} reset={reset} />
      </body>
    </html>
  );
}
