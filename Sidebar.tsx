"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setSessionToken } from "@/components/SessionBridge";

export type NavItem = { label: string; href: string; icon: string };
export type NavGroup = { title: string; items: NavItem[] };

const ICONS: Record<string, string> = {
  home: "M3 12 12 3l9 9M5 10v10h5v-6h4v6h5V10",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  award: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89 7 23l5-3 5 3-1.21-9.12",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  promote: "M12 19V5M5 12l7-7 7 7",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z",
  database: "M12 2C7 2 3 3.5 3 5.5v13C3 20.5 7 22 12 22s9-1.5 9-3.5v-13C21 3.5 17 2 12 2zM3 12c0 2 4 3.5 9 3.5s9-1.5 9-3.5M3 5.5c0 2 4 3.5 9 3.5s9-1.5 9-3.5",
};

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICONS[name] ?? ICONS.home} />
    </svg>
  );
}

export function Sidebar({
  groups,
  name,
  email,
  roleLabel,
}: {
  groups: NavGroup[];
  name: string;
  email: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Plain JSON request + full page load: needs no special headers either way.
  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Even if the server is unreachable, forget the session in this tab.
    }
    setSessionToken(null);
    window.location.assign("/");
  }
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const content = (
    <div className="flex h-full flex-col bg-[#0b4fb3] text-white">
      <div className="flex items-center gap-3 border-b border-white/15 px-4 py-4">
        <Image src="/logo.png" alt="logo" width={48} height={48} className="h-12 w-12 rounded-full bg-white object-cover" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">D.PRINCE Learning Portal</p>
          <p className="truncate text-xs text-blue-100">{email}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-200">{roleLabel}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.title];
          return (
            <div key={g.title} className="mb-2">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-blue-100 hover:text-white"
              >
                {g.title}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {!isCollapsed && (
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/15 font-semibold text-white" : "text-blue-50 hover:bg-white/10"}`}
                        >
                          <Icon name={item.icon} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/15 p-3">
        <button type="button" onClick={logout} disabled={leaving} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          {leaving ? "Signing out..." : "Logout"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0b4fb3] px-4 py-3 text-white shadow lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-1 hover:bg-white/10">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <span className="font-semibold">D.prince Learning Portal</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">{name.charAt(0).toUpperCase()}</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[85%] shadow-2xl">{content}</aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">{content}</aside>
    </>
  );
}
