import type { ReactNode } from "react";
import { requireUser, ROLE_LABEL, type Role } from "@/lib/auth";
import { Sidebar, type NavGroup } from "@/components/Sidebar";
import { BuiltBy } from "@/components/BuiltBy";

export const dynamic = "force-dynamic";

function navFor(role: Role): NavGroup[] {
  if (role === "student") {
    return [
      { title: "Main", items: [{ label: "Dashboard", href: "/dashboard", icon: "home" }, { label: "My Profile", href: "/dashboard/profile", icon: "user" }] },
      {
        title: "Academics",
        items: [
          { label: "My Courses / Subjects", href: "/dashboard/courses", icon: "book" },
          { label: "CBT Tests", href: "/dashboard/tests", icon: "clipboard" },
          { label: "My Assignments", href: "/dashboard/assignments", icon: "upload" },
          { label: "Course Materials", href: "/dashboard/materials", icon: "book" },
          { label: "Past Questions", href: "/dashboard/past-questions", icon: "clipboard" },
          { label: "My Results", href: "/dashboard/results", icon: "award" },
          { label: "My Attendance", href: "/dashboard/attendance", icon: "calendar" },
        ],
      },
      {
        title: "Communication",
        items: [
          { label: "Notice Board", href: "/dashboard/notices", icon: "bell" },
          { label: "Messages", href: "/dashboard/messages", icon: "mail" },
        ],
      },
    ];
  }
  const groups: NavGroup[] = [
    { title: "Main", items: [{ label: "Dashboard", href: "/dashboard", icon: "home" }, { label: "My Profile", href: "/dashboard/profile", icon: "user" }] },
    {
      title: "Student",
      items: [
        { label: "Admit Student", href: "/dashboard/students/new", icon: "user" },
        { label: "Bulk Upload", href: "/dashboard/students/bulk", icon: "upload" },
        { label: "Student Information", href: "/dashboard/students", icon: "edit" },
        { label: "Student Promotion", href: "/dashboard/students/promotion", icon: "promote" },
      ],
    },
    {
      title: "Class & Courses",
      items: [
        { label: "Courses / Subjects", href: "/dashboard/courses", icon: "book" },
        { label: "Course Approvals", href: "/dashboard/courses/approvals", icon: "check" },
      ],
    },
    {
      title: "CBT Examination",
      items: [
        { label: "CBT Tests", href: "/dashboard/tests", icon: "clipboard" },
        { label: "AI Assistant", href: "/dashboard/ai-assistant", icon: "edit" },
        { label: "Assignments", href: "/dashboard/assignments", icon: "upload" },
        { label: "Course Materials", href: "/dashboard/materials", icon: "book" },
        { label: "Past Questions", href: "/dashboard/past-questions", icon: "clipboard" },
        { label: "Payments", href: "/dashboard/payments", icon: "award" },
        { label: "Results", href: "/dashboard/results", icon: "award" },
        { label: "Attendance", href: "/dashboard/attendance", icon: "calendar" },
      ],
    },
    {
      title: "Notice Board",
      items: [
        { label: "Notices", href: "/dashboard/notices", icon: "bell" },
        { label: "Messages", href: "/dashboard/messages", icon: "mail" },
      ],
    },
  ];
  if (role === "super_admin") {
    groups.push({
      title: "Administration",
      items: [
        { label: "Staff Management", href: "/dashboard/staff", icon: "shield" },
        { label: "Academic Sessions", href: "/dashboard/sessions", icon: "calendar" },
        { label: "Database / Supabase", href: "/dashboard/settings", icon: "database" },
      ],
    });
  }
  return groups;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const role = user.role as Role;
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar groups={navFor(role)} name={user.name} email={user.email} roleLabel={ROLE_LABEL[role]} />
      <div className="flex min-h-screen flex-col lg:pl-72">
        <div className="hidden items-center justify-between border-b border-slate-200 bg-white px-6 py-3 lg:flex">
          <p className="text-sm text-slate-500">
            Welcome back, <span className="font-semibold text-slate-800">{user.name}</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="badge-blue">{ROLE_LABEL[role]}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b4fb3] text-sm font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-4 py-3">
          <BuiltBy />
        </footer>
      </div>
    </div>
  );
}
