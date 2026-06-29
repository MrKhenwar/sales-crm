import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCallLogs, listCallsByPhone, formatDuration, type CallLogFilters } from "@/lib/calls/queries";
import { listActiveSalespeople } from "@/lib/leads/queries";
import type { CallOutcome } from "@/generated/prisma/enums";

const OUTCOMES: CallOutcome[] = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED", "PENDING"];

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const sp = await searchParams;
  const tab = sp.tab === "by-number" ? "by-number" : "log";

  const filters: CallLogFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    outcome: asEnum(sp.outcome, OUTCOMES),
    agentUserId: typeof sp.agent === "string" ? sp.agent : undefined,
    from: typeof sp.from === "string" ? new Date(sp.from) : undefined,
    to: typeof sp.to === "string" ? new Date(sp.to + "T23:59:59") : undefined,
  };

  const [salespeople, log, byPhone] = await Promise.all([
    role === "MANAGER" ? listActiveSalespeople() : Promise.resolve([]),
    tab === "log"
      ? listCallLogs({ userId: session.user.id, role, filters, take: 200 })
      : Promise.resolve({ items: [], total: 0, totalDurationSec: 0, avgDurationSec: 0 }),
    tab === "by-number"
      ? listCallsByPhone({ userId: session.user.id, role, q: filters.q, take: 100 })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Call logs</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {role === "MANAGER" ? "Every call your team has logged in the CRM." : "Every call you've logged in the CRM."}
          </p>
        </div>
        <div className="flex gap-1 text-sm rounded-lg ring-1 ring-slate-200 bg-white p-1 self-start">
          <Link href="/calls?tab=log" prefetch className={`px-3 py-1 rounded-md ${tab === "log" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Timeline</Link>
          <Link href="/calls?tab=by-number" prefetch className={`px-3 py-1 rounded-md ${tab === "by-number" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>By number</Link>
        </div>
      </div>

      <form method="GET" className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search by phone or lead name"
          className="col-span-2 md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 font-mono"
        />
        {tab === "log" ? (
          <>
            <select name="outcome" defaultValue={filters.outcome ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
              <option value="">All outcomes</option>
              {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
            </select>
            {role === "MANAGER" ? (
              <select name="agent" defaultValue={filters.agentUserId ?? ""} className="rounded-lg border border-slate-300 px-2 py-2">
                <option value="">All salespeople</option>
                {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : <div className="hidden md:block" />}
            <input type="date" name="from" defaultValue={sp.from as string | undefined} className="rounded-lg border border-slate-300 px-2 py-2" />
            <input type="date" name="to"   defaultValue={sp.to as string | undefined} className="rounded-lg border border-slate-300 px-2 py-2" />
          </>
        ) : <div className="hidden md:block col-span-4" />}
        <div className="col-span-2 md:col-span-6 flex gap-2 justify-end">
          <Link href={`/calls?tab=${tab}`} prefetch={false} className="text-slate-500 hover:text-slate-800 text-sm px-3 py-2">Reset</Link>
          <button type="submit" className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm">Apply</button>
        </div>
      </form>

      {tab === "log" ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat label="Calls" value={log.total.toString()} />
            <Stat label="Total talk time" value={formatDuration(log.totalDurationSec)} />
            <Stat label="Average call" value={formatDuration(log.avgDurationSec)} />
          </div>

          {log.items.length === 0 ? (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-12 text-center text-slate-500">
              No calls match these filters.
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {log.items.map((c) => (
                  <li key={c.id} className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/leads/${c.leadId}`} prefetch className="font-medium hover:underline truncate">{c.lead.name}</Link>
                      <OutcomeChip outcome={c.outcome} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">{c.lead.phone}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span className="tabular-nums">{new Date(c.startedAt).toLocaleString()}</span>
                      <span className="tabular-nums font-medium text-slate-700">{formatDuration(c.durationSec ?? 0)}</span>
                    </div>
                    {role === "MANAGER" ? <div className="mt-1 text-xs text-slate-500">Agent: {c.user.name}</div> : null}
                    {c.feedbackNote || c.recordingUrl ? (
                      <div className="mt-2 text-xs text-slate-600">
                        {c.feedbackNote}
                        {c.recordingUrl ? <> {c.feedbackNote ? "· " : ""}<a className="underline" href={c.recordingUrl} target="_blank" rel="noreferrer">recording</a></> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden md:block rounded-2xl bg-white ring-1 ring-slate-200 scroll-x">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3">When</th>
                      <th className="text-left px-4 py-3">Lead</th>
                      <th className="text-left px-4 py-3">Number</th>
                      {role === "MANAGER" ? <th className="text-left px-4 py-3">Agent</th> : null}
                      <th className="text-left px-4 py-3">Outcome</th>
                      <th className="text-right px-4 py-3">Duration</th>
                      <th className="text-left px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.items.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {new Date(c.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/leads/${c.leadId}`} prefetch className="font-medium hover:underline">{c.lead.name}</Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{c.lead.phone}</td>
                        {role === "MANAGER" ? <td className="px-4 py-3 text-slate-600">{c.user.name}</td> : null}
                        <td className="px-4 py-3">
                          <OutcomeChip outcome={c.outcome} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatDuration(c.durationSec ?? 0)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[20ch] truncate" title={c.feedbackNote ?? ""}>
                          {c.feedbackNote ?? <span className="text-slate-400">—</span>}
                          {c.recordingUrl ? <> · <a className="underline" href={c.recordingUrl} target="_blank" rel="noreferrer">rec</a></> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 scroll-x">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Number</th>
                <th className="text-left px-4 py-3">Lead</th>
                {role === "MANAGER" ? <th className="text-left px-4 py-3">Assignee</th> : null}
                <th className="text-right px-4 py-3">Times called</th>
                <th className="text-right px-4 py-3">Connected</th>
                <th className="text-right px-4 py-3">Total talk</th>
                <th className="text-right px-4 py-3">Avg call</th>
                <th className="text-right px-4 py-3">Last called</th>
              </tr>
            </thead>
            <tbody>
              {byPhone.length === 0 ? (
                <tr><td colSpan={role === "MANAGER" ? 8 : 7} className="px-4 py-12 text-center text-slate-500">No numbers have been called yet.</td></tr>
              ) : byPhone.map((p) => (
                <tr key={p.leadId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono">{p.phone}</td>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${p.leadId}`} prefetch className="font-medium hover:underline">{p.name}</Link>
                  </td>
                  {role === "MANAGER" ? <td className="px-4 py-3 text-slate-600">{p.assignee ?? <span className="text-slate-400">unassigned</span>}</td> : null}
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.total}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{p.connected}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatDuration(p.totalDurationSec)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatDuration(p.avgDurationSec)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                    {p.lastCalledAt ? new Date(p.lastCalledAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: CallOutcome }) {
  const styles: Record<CallOutcome, string> = {
    CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    NO_ANSWER: "bg-amber-50 text-amber-700 ring-amber-200",
    BUSY: "bg-amber-50 text-amber-700 ring-amber-200",
    FAILED: "bg-red-50 text-red-700 ring-red-200",
    PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 ring-1 text-[10px] font-semibold uppercase tracking-wide ${styles[outcome]}`}>
      {outcome.replace("_", " ")}
    </span>
  );
}
