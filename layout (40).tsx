import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionBridge } from "@/components/SessionBridge";

export const metadata: Metadata = {
  title: "D.prince Learning Portal",
  description: "D.prince Learning Portal - School Management System with CBT, attendance, notices and messaging.",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <SessionBridge />
        {children}
      </body>
    </html>
  );
}
