"use client";

export function SelectAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4"
      aria-label="Select all"
      onChange={(e) => {
        const form = e.currentTarget.closest("form");
        form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((cb) => {
          cb.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
