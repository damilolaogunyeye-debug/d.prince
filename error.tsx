"use client";

import { PortalError } from "@/components/Recovery";

// Replaces Next.js's generic "This page couldn't load" screen for every page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalError error={error} reset={reset} />;
}
