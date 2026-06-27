import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAutoAssignMode } from "@/lib/settings";
import { listActiveCalls, talkTimeBySalesperson, formatDuration, startOfTodayUTC, startOfWeek } from "@/lib/calls/queries";
import { ActiveCalls } from "@/components/ActiveCalls";

export default async function ManagerHome() {
  const session = await auth();
  if (session?.user.role !== "MANAGER") redirect("/");

  const [
    totalUsers,
    activeSalespeople,
    totalLeads,
    leadsBySource,
    mode,
    activeCalls,
    talkToday,
    talkWeek,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "SALESPERSON", active: true } }),
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
    getAutoAssignMode(),
    listActiveCalls({ userId: session.user.id, role: "MANAGER" }),
    talkTimeBySalesperson({ since: startOfTodayUTC() }),
    talkTimeBySalesperson({ since: startOfWeek() }),
  ]);

  const initialActive = activeCalls.map((c) => ({
    id: c.id,
    startedAtMs: c.startedAt.getTime(),
    agentName: c.user.name,
    leadName: c.lead.name,
    leadId: c.lead.id,
    phone: c.lead.phone,
  }));

  const byUser = new Map<string, { name: string; today: number; week: number; todayCalls: number; weekCalls: number; weekConnected: number }>();
  for (const r of talkToday) {
    byUser.set(r.userId, {
      name: r.name,
      today: r.totalDurationSec, todayCalls: r.totalCalls,
      week: 0, weekCalls: 0, weekConnected: 0,
    });
  }
  for (const r of talkWeek) {
    const cur = byUser.get(r.userId);
    if (cur) {
      cur.week = r.totalDurationSec;
      cur.weekCalls = r.totalCalls;
      cur.weekConnected = r.connected;
    } else {
      byUser.set(r.userId, {
        name: r.name,
        today: 0, todayCalls: 0,
        week: r.totalDurationSec, weekCalls: r.totalCalls, weekConnected: r.connected,
      });
    }
  }
  const talkRows = Array.from(byUser.values()).sort((a, b) => b.week - a.week);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manager dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Live call activity, talk time per salesperson, and ingestion controls.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/manager/users" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
            Users
          </Link>
          <Link href="/leads/import" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
            Import CSV
          </Link>
          <Link href="/manager/settings" prefetch className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800">
            Ingestion settings
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Total leads" value={String(totalLeads)} />
        <Stat label="Active salespeople" value={String(activeSalespeople)} />
        <Stat label="Total users" value={String(totalUsers)} />
        <Stat label="Auto-assign" value={mode === "round_robin" ? "Round-robin" : "Unassigned"} />
      </div>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Active calls right now</h2>
          <span className="text-xs text-slate-500">live · updates every 4s</span>
        </div>
        <div className="mt-3">
          <ActiveCalls initial={initialActive} fetchUrl="/api/calls/active-list" />
        </div>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-medium">Talk time by salesperson</h2>
        <p className="text-xs text-slate-500 mt-1">Sum of recorded call durations.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left pb-2">Salesperson</th>
                <th className="text-right pb-2">Today calls</th>
                <th className="text-right pb-2">Today talk</th>
                <th className="text-right pb-2">Week calls</th>
                <th className="text-right pb-2">Connected</th>
                <th className="text-right pb-2">Week talk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {talkRows.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No calls logged yet.</td></tr>
              ) : talkRows.map((r) => (
                <tr key={r.name}>
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2 text-right tabular-nums">{r.todayCalls}</td>
                  <td className="py-2 text-right tabular-nums">{formatDuration(r.today)}</td>
                  <td className="py-2 text-right tabular-nums">{r.weekCalls}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-700">{r.weekConnected}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{formatDuration(r.week)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-medium">Leads by source</h2>
        <ul className="mt-3 text-sm grid sm:grid-cols-3 gap-3">
          {leadsBySource.map((b) => (
            <li key={b.source} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-700">{b.source}</span>
              <span className="font-semibold tabular-nums">{b._count._all}</span>
            </li>
          ))}
          {leadsBySource.length === 0 ? <li className="text-slate-500">No leads yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </div>
  );
}
