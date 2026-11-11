/** Credit line shown on the login page and at the foot of every dashboard page. */
export function BuiltBy({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-slate-500 ${className}`}>
      © 2026 Developed by: <span className="font-semibold text-[#0b4fb3]">Mr. Dammy</span>. All rights reserved.
    </p>
  );
}
