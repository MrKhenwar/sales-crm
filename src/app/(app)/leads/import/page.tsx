import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { importCsvAction } from "@/lib/leads/import-actions";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; duplicates?: string; errors?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "MANAGER") redirect("/");
  const sp = await searchParams;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/leads" prefetch className="text-sm text-slate-500 hover:text-slate-800">← Leads</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Import leads from CSV</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Paste rows or upload a file. Columns: <code className="text-xs">name, phone, email, campaign</code> — header optional.
          Phone numbers are de-duped automatically. New leads are auto-assigned per the current rule.
        </p>
      </div>

      {sp.error ? (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">{sp.error}</div>
      ) : null}

      {sp.created !== undefined ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">
          <strong>Imported:</strong> {sp.created} created · {sp.duplicates} duplicates skipped · {sp.errors} errors
        </div>
      ) : null}

      <form action={importCsvAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Paste CSV</span>
          <textarea
            name="csv"
            rows={10}
            placeholder={`name,phone,email,campaign\nAarav Sharma,+919812345678,aarav@example.com,Diwali Push`}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-slate-900 focus:outline-none"
          />
        </label>

        <div className="text-xs text-slate-400">— or —</div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Upload .csv file</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="mt-2 block text-sm"
          />
        </label>

        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800">
            Import
          </button>
        </div>
      </form>
    </div>
  );
}
