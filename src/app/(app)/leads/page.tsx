import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { listLeadsForUser, resolveDatePreset, type LeadFilters, type DatePreset } from "@/lib/leads/queries";
import { assignAllUnassigned, bulkReassignByLabel, reassignFromUser } from "@/lib/leads/actions";
import { isManagerOrAdmin, listAssignableSalespeople } from "@/lib/scope";
import { AutoLabelChip, ManualLabelChip, AUTO_LABEL_TEXT, MANUAL_LABELS, MANUAL_LABEL_TEXT } from "@/components/Labels";
import { ManagerAssignBar } from "@/components/ManagerAssignBar";
import { LeadsDateFilter } from "@/components/LeadsDateFilter";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { CallButton } from "@/components/CallButton";
import { SyncButton } from "@/components/SyncButton";
import type { AutoLabel, LeadSource } from "@/generated/prisma/enums";

const SOURCES: LeadSource[] = ["META", "SHEET", "MANUAL"];
const AUTO_LABELS: AutoLabel[] = ["NONE", "NOT_PICKED", "CONNECTED", "REDIAL"];
const DATE_PRESETS: DatePreset[] = ["today", "yesterday", "week", "month", "year"];
const SORTS = [
  { v: "uncontacted", label: "To-call first (called at bottom)" },
  { v: "newest", label: "Newest first" },
  { v: "redial_due", label: "Redial due first" },
] as const;

// The named views from the drawer's Leads/Filters section.
const VIEWS = {
  all: { title: "All leads", activeOnly: false, mine: false },
  all_active: { title: "All active leads", activeOnly: true, mine: false },
  assigned: { title: "Leads assigned to me", activeOnly: false, mine: true },
  mine: { title: "My leads", activeOnly: false, mine: true },
} as const;
type ViewKey = keyof typeof VIEWS;

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Parse a YYYY-MM-DD input into a Date, at start or end of that day. */
function asDate(v: unknown, endOfDay = false): Date | undefined {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const d = new Date(endOfDay ? `${v}T23:59:59.999` : `${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const canManage = isManagerOrAdmin(role);
  const isAdmin = role === "ADMIN";
  const sp = await searchParams;

  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);

  // Named view (from the drawer's Leads/Filters section) sets the base scope.
  const viewKey = asEnum(sp.view, ["all", "all_active", "assigned", "mine"] as const) ?? "all";
  const view = VIEWS[viewKey as ViewKey];

  // Date-wise filter: a preset chip (today/yesterday/week/month/year) OR a
  // custom From/To range. Custom range wins when both from & to are present.
  const preset = asEnum(sp.range, DATE_PRESETS);
  const customFrom = asDate(sp.from);
  const customTo = asDate(sp.to, true);
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (customFrom || customTo) {
    dateFrom = customFrom;
    dateTo = customTo;
  } else if (preset) {
    ({ from: dateFrom, to: dateTo } = resolveDatePreset(preset));
  }

  const filters: LeadFilters = {
    q: str(sp.q),
    source: asEnum(sp.source, SOURCES),
    activeOnly: view.activeOnly || undefined,
    autoLabel: asEnum(sp.autoLabel, AUTO_LABELS),
    manualLabel: asEnum(sp.manualLabel, MANUAL_LABELS),
    campaign: str(sp.campaign),
    // "My leads"/"Assigned to me" scope to the logged-in user; managers can also
    // pick a specific salesperson via the assignee dropdown.
    assignedToUserId: view.mine ? session.user.id : str(sp.assignee),
    dateFrom,
    dateTo,
    sort: asEnum(sp.sort, ["newest", "uncontacted", "redial_due"] as const),
  };

  const [{ items, total }, salespeople, unassignedCount] = await Promise.all([
    listLeadsForUser({ userId: session.user.id, role, filters, take: 100 }),
    canManage ? listAssignableSalespeople(session.user) : Promise.resolve([]),
    isAdmin ? prisma.lead.count({ where: { assignedToUserId: null } }) : Promise.resolve(0),
  ]);

  const assignedCount = typeof sp.assigned === "string" ? sp.assigned : undefined;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            {view.title}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {filters.campaign ? <>Campaign: <span className="font-medium text-slate-700">{filters.campaign}</span> · </> : null}
            {total} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? <SyncButton compact /> : null}
          {canManage ? (
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

      {assignedCount !== undefined ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">
          {assignedCount} lead{assignedCount === "1" ? "" : "s"} assigned.
        </div>
      ) : null}
      {errorMsg ? (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-sm px-3 py-2 ring-1 ring-amber-100">{errorMsg}</div>
      ) : null}

      {canManage ? (
        <ManagerAssignBar
          salespeople={salespeople}
          unassignedCount={unassignedCount}
          isAdmin={isAdmin}
          assignAllAction={assignAllUnassigned}
          reassignByLabelAction={bulkReassignByLabel}
          reassignFromUserAction={reassignFromUser}
        />
      ) : null}

      {/* Date-wise filter: preset chips + custom From/To range */}
      <LeadsDateFilter />

      <form
        method="GET"
        className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm"
      >
        {/* Preserve the active view + date filter when applying other filters. */}
        {viewKey !== "all" ? <input type="hidden" name="view" value={viewKey} /> : null}
        {filters.campaign ? <input type="hidden" name="campaign" value={filters.campaign} /> : null}
        {typeof sp.range === "string" ? <input type="hidden" name="range" value={sp.range} /> : null}
        {typeof sp.from === "string" ? <input type="hidden" name="from" value={sp.from} /> : null}
        {typeof sp.to === "string" ? <input type="hidden" name="to" value={sp.to} /> : null}
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
            <option key={s} value={s}>{AUTO_LABEL_TEXT[s]}</option>
          ))}
        </select>
        <select name="manualLabel" defaultValue={filters.manualLabel ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
          <option value="">All labels</option>
          {MANUAL_LABELS.map((s) => <option key={s} value={s}>{MANUAL_LABEL_TEXT[s]}</option>)}
        </select>
        {canManage ? (
          <select name="assignee" defaultValue={filters.assignedToUserId ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
            <option value="">All salespeople</option>
            {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <div className="hidden md:block" />
        )}
        <select name="sort" defaultValue={filters.sort ?? "uncontacted"} className="rounded-lg border border-slate-300 px-2 py-2">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <div className="col-span-2 md:col-span-6 flex gap-2 justify-end">
          <Link href={viewKey === "all" ? "/leads" : `/leads?view=${viewKey}`} prefetch={false} className="text-slate-500 hover:text-slate-800 text-sm px-3 py-2">
            Reset
          </Link>
          <button type="submit" className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm">
            Apply
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-12 text-center text-slate-500">
          No leads match these filters.
        </div>
      ) : (
        <>
          {/* Mobile: card list with always-visible actions */}
          <ul className="space-y-3 md:hidden">
            {items.map((lead) => (
              <li key={lead.id} className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} prefetch className="font-medium text-slate-900 hover:underline block truncate">
                      {lead.name}
                    </Link>
                    <div className="text-xs text-slate-500 tabular-nums mt-0.5">{lead.phone}</div>
                    {lead.notes[0] ? (
                      <div className="text-xs text-slate-600 mt-1 line-clamp-2">{lead.notes[0].body}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : "Never"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">{lead.source}</span>
                  <AutoLabelChip label={lead.autoLabel} />
                  {lead.labels.map((l) => <ManualLabelChip key={l.label} label={l.label} />)}
                </div>

                {canManage ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {lead.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span>}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CallButton fullWidth leadId={lead.id} phone={lead.phone} />
                  <WhatsAppButton fullWidth phone={lead.phone} name={lead.name} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table (scrolls horizontally instead of clipping) */}
          <div className="hidden md:block rounded-2xl bg-white ring-1 ring-slate-200 scroll-x">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Lead</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Labels</th>
                  {canManage ? <th className="text-left px-4 py-3">Assignee</th> : null}
                  <th className="text-left px-4 py-3">Last contact</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => (
                  <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} prefetch className="font-medium text-slate-900 hover:underline">
                        {lead.name}
                      </Link>
                      <div className="text-xs text-slate-500 tabular-nums">{lead.phone}</div>
                      {lead.notes[0] ? (
                        <div className="text-xs text-slate-600 mt-0.5 max-w-[28ch] truncate">{lead.notes[0].body}</div>
                      ) : null}
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
                    {canManage ? (
                      <td className="px-4 py-3 text-slate-700">{lead.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                    ) : null}
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <CallButton compact leadId={lead.id} phone={lead.phone} />
                        <WhatsAppButton compact phone={lead.phone} name={lead.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
