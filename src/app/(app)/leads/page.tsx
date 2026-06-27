import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listLeadsForUser, listActiveSalespeople, type LeadFilters } from "@/lib/leads/queries";
import { AutoLabelChip, ManualLabelChip } from "@/components/Labels";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { startCallForLead } from "@/lib/calls/actions";
import type { AutoLabel, LeadSource, ManualLabel } from "@/generated/prisma/enums";

const SOURCES: LeadSource[] = ["META", "SHEET", "MANUAL"];
const AUTO_LABELS: AutoLabel[] = ["NONE", "NOT_PICKED", "CONNECTED", "REDIAL"];
const MANUAL_LABELS: ManualLabel[] = ["DISPATCH", "BOOKED", "ORDERED", "PAID"];
const SORTS = [
  { v: "newest", label: "Newest first" },
  { v: "uncontacted", label: "Uncontacted first" },
  { v: "redial_due", label: "Redial due first" },
] as const;

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const sp = await searchParams;

  const filters: LeadFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    source: asEnum(sp.source, SOURCES),
    autoLabel: asEnum(sp.autoLabel, AUTO_LABELS),
    manualLabel: asEnum(sp.manualLabel, MANUAL_LABELS),
    assignedToUserId: typeof sp.assignee === "string" ? sp.assignee : undefined,
    sort: asEnum(sp.sort, ["newest", "uncontacted", "redial_due"] as const),
  };

  const [{ items, total }, salespeople] = await Promise.all([
    listLeadsForUser({ userId: session.user.id, role, filters, take: 100 }),
    role === "MANAGER" ? listActiveSalespeople() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {role === "MANAGER" ? "All leads across the team." : "Your assigned leads."} {total} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === "MANAGER" ? (
            <Link href="/leads/import" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50 transition">
              Import CSV
            </Link>
          ) : null}
          <Link
            href="/leads/new"
            prefetch
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 transition"
          >
            New lead
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm"
      >
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search name / phone / email"
          className="col-span-2 md:col-span-2 rounded-lg border border-slate-300 px-3 py-2"
        />
        <select name="source" defaultValue={filters.source ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="autoLabel" defaultValue={filters.autoLabel ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
          <option value="">All call states</option>
          {AUTO_LABELS.filter((l) => l !== "NONE").map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select name="manualLabel" defaultValue={filters.manualLabel ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
          <option value="">All labels</option>
          {MANUAL_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {role === "MANAGER" ? (
          <select name="assignee" defaultValue={filters.assignedToUserId ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
            <option value="">All salespeople</option>
            {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <div className="hidden md:block" />
        )}
        <select name="sort" defaultValue={filters.sort ?? "newest"} className="rounded-lg border border-slate-300 px-2 py-2">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <div className="col-span-2 md:col-span-6 flex gap-2 justify-end">
          <Link href="/leads" prefetch={false} className="text-slate-500 hover:text-slate-800 text-sm px-3 py-2">
            Reset
          </Link>
          <button type="submit" className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm">
            Apply
          </button>
        </div>
      </form>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Lead</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Labels</th>
              {role === "MANAGER" ? <th className="text-left px-4 py-3">Assignee</th> : null}
              <th className="text-left px-4 py-3">Last contact</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={role === "MANAGER" ? 6 : 5} className="px-4 py-12 text-center text-slate-500">No leads match these filters.</td></tr>
            ) : items.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/leads/${lead.id}`} prefetch className="font-medium text-slate-900 hover:underline">
                    {lead.name}
                  </Link>
                  <div className="text-xs text-slate-500 tabular-nums">{lead.phone}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {lead.source}
                  {lead.campaignName ? <div className="text-xs text-slate-400">{lead.campaignName}</div> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <AutoLabelChip label={lead.autoLabel} />
                    {lead.labels.map((l) => <ManualLabelChip key={l.label} label={l.label} />)}
                  </div>
                </td>
                {role === "MANAGER" ? (
                  <td className="px-4 py-3 text-slate-700">{lead.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                ) : null}
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <form action={startCallForLead}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-1 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
                      >
                        Call
                      </button>
                    </form>
                    <WhatsAppButton compact phone={lead.phone} name={lead.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
