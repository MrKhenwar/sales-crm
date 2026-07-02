import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createLead } from "@/lib/leads/actions";
import { isManagerOrAdmin, listAssignableSalespeople } from "@/lib/scope";

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { error } = await searchParams;
  const canManage = isManagerOrAdmin(session.user.role);
  const salespeople = canManage ? await listAssignableSalespeople(session.user) : [];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New lead</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Manual entry. Phase 3 adds Meta webhook + Google Sheet sync + CSV bulk import.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">
          {error}
        </div>
      ) : null}

      <form action={createLead} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-4">
        <Field label="Name" name="name" required placeholder="Aarav Sharma" />
        <Field label="Phone (E.164)" name="phone" required placeholder="+919812345678" />
        <Field label="Email" name="email" type="email" placeholder="optional" />
        <Field label="Campaign" name="campaignName" placeholder="optional" />

        {canManage ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Assign to</span>
            <select
              name="assignedToUserId"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-xs text-slate-500">This lead will be assigned to you.</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/leads" prefetch={false} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2">
            Cancel
          </Link>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800">
            Create lead
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}{required ? " *" : ""}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
      />
    </label>
  );
}
