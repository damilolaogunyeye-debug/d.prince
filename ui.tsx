import type { ReactNode } from "react";

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${err ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {err ?? msg}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, color = "blue" }: { label: string; value: string | number; hint?: string; color?: "blue" | "green" | "amber" | "red" | "purple" }) {
  const colors = {
    blue: "from-blue-600 to-blue-500",
    green: "from-emerald-600 to-emerald-500",
    amber: "from-amber-500 to-amber-400",
    red: "from-rose-600 to-rose-500",
    purple: "from-violet-600 to-violet-500",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${colors[color]} p-5 text-white shadow`}>
      <p className="text-sm font-medium text-white/80">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/70">{hint}</p>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{text}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "badge-green", present: "badge-green", submitted: "badge-green", published: "badge-green", active: "badge-green",
    pending: "badge-yellow", late: "badge-yellow", in_progress: "badge-yellow", draft: "badge-yellow",
    rejected: "badge-red", absent: "badge-red", inactive: "badge-red", closed: "badge-red",
    excused: "badge-blue", open: "badge-blue", upcoming: "badge-gray",
  };
  return <span className={map[status] ?? "badge-gray"}>{status.replace("_", " ")}</span>;
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const fmtDay = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
