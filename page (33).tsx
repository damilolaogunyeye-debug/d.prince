import { requireUser } from "@/lib/auth";
import { bulkRegisterStudentsAction } from "@/lib/actions/users";
import { Flash, PageHeader } from "@/components/ui";
import { CsvPicker } from "@/components/CsvPicker";

export default async function BulkUploadPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { msg, err } = await searchParams;
  return (
    <div>
      <PageHeader title="Bulk Upload Students" subtitle="Upload a CSV file or paste rows. One student per line." />
      <Flash msg={msg} err={err} />
      <form action={bulkRegisterStudentsAction} className="card max-w-3xl space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Format per line: <code className="rounded bg-white px-1">name,email,username,password,class,department</code>
          <br />Example: <code className="rounded bg-white px-1">Jane Doe,jane@mail.com,jane.doe,pass123,SSS 2,Science</code>
        </div>
        <CsvPicker textareaName="csv" />
        <button className="btn-primary">Upload Students</button>
      </form>
    </div>
  );
}
