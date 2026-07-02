import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAutoAssignMode } from "@/lib/settings";
import {
  listActiveCalls,
  talkTimeBySalesperson,
  teamCallStats,
  formatDuration,
  startOfTodayUTC,
  startOfWeek,
} from "@/lib/calls/queries";
import { leadFunnel } from "@/lib/leads/queries";
import { isManagerOrAdmin, visibleUserIds } from "@/lib/scope";
import { ActiveCalls } from "@/components/ActiveCalls";

export default async function ManagerHome() {
  const session = await auth();
  if (!session?.user || !isManagerOrAdmin(session.user.role)) redirect("/");
  const isAdmin = session.user.role === "ADMIN";

  const todayStart = startOfTodayUTC();
  const weekStart = startOfWeek();

  // Scope every dashboard aggregate to the viewer's team. Admin (null) sees all.
  const visibleIds = await visibleUserIds(session.user);
  const teamUserFilter = visibleIds ? { id: { in: visibleIds } } : {};
  const leadScope = visibleIds ? { assignedToUserId: { in: visibleIds } } : {};

  const [
    totalUsers,
    activeSalespeople,
    funnel,
    leadsBySource,
    mode,
    activeCalls,
    statsToday,
    statsWeek,
    talkToday,
    talkWeek,
  ] = await Promise.all([
    prisma.user.count({ where: teamUserFilter }),
    prisma.user.count({ where: { role: "SALESPERSON", active: true, ...(visibleIds ? { managerId: session.user.id } : {}) } }),
    leadFunnel(visibleIds),
    prisma.lead.groupBy({ by: ["source"], where: leadScope, _count: { _all: true } }),
    getAutoAssignMode(),
    listActiveCalls({ userId: session.user.id, role: session.user.role }),
    teamCallStats({ since: todayStart, visibleIds }),
    teamCallStats({ since: weekStart, visibleIds }),
    talkTimeBySalesperson({ since: todayStart, visibleIds }),
    talkTimeBySalesperson({ since: weekStart, visibleIds }),
  ]);

  const initialActive = activeCalls.map((c) => ({
    id: c.id,
    startedAtMs: c.startedAt.getTime(),
    agentName: c.user.name,
    leadName: c.lead.name,
    leadId: c.lead.id,
    phone: c.lead.phone,
  }));

  const byUser = new Map<
    string,
    { name: string; today: number; week: number; todayCalls: number; weekCalls: number; weekConnected: number }
  >();
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{isAdmin ? "Admin dashboard" : "Manager dashboard"}</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {isAdmin
              ? "Live calls, picked vs not-picked, talk time, and lead funnel across every team."
              : "Live calls, picked vs not-picked, talk time per salesperson, and lead funnel for your team."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link href="/manager/users" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
              Users
            </Link>
          ) : (
            <Link href="/manager/team" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
              My team
            </Link>
          )}
          {isAdmin ? (
            <>
              <Link href="/leads/import" prefetch className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
                Import CSV
              </Link>
              <Link href="/manager/settings" prefetch className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800">
                Ingestion
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Total leads" value={String(funnel.total)} />
        <Stat label="Contacted" value={String(funnel.contacted)} sub={`${funnel.uncontacted} not yet`} accent="emerald" />
        <Stat label="Active salespeople" value={String(activeSalespeople)} sub={`${totalUsers} users total`} />
        <Stat label="Auto-assign" value={mode === "round_robin" ? "Round-robin" : "Unassigned"} />
      </div>

      {/* Call performance: today + this week */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6">
        <h2 className="font-medium">Call performance</h2>
        <p className="text-xs text-slate-500 mt-1">Picked = connected calls · Not picked = no-answer / busy / failed.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PerfBlock title="Today" stats={statsToday} />
          <PerfBlock title="This week" stats={statsWeek} />
        </div>
      </section>

      {/* Live calls */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Active calls right now</h2>
          <span className="text-xs text-slate-500">live · 4s</span>
        </div>
        <div className="mt-3">
          <ActiveCalls initial={initialActive} fetchUrl="/api/calls/active-list" />
        </div>
      </section>

      {/* Talk time per salesperson — table on desktop, cards on mobile */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6">
        <h2 className="font-medium">Talk time by salesperson</h2>
        <p className="text-xs text-slate-500 mt-1">Calls placed and time talked, today and this week.</p>

        {talkRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No calls logged yet.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="mt-4 space-y-3 md:hidden">
              {talkRows.map((r) => (
                <li key={r.name} className="rounded-xl ring-1 ring-slate-200 p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <KV label="Today calls" value={String(r.todayCalls)} />
                    <KV label="Today talk" value={formatDuration(r.today)} />
                    <KV label="Week calls" value={String(r.weekCalls)} />
                    <KV label="Connected" value={String(r.weekConnected)} accent="emerald" />
                    <KV label="Week talk" value={formatDuration(r.week)} strong />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="mt-4 hidden md:block scroll-x">
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
                  {talkRows.map((r) => (
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
          </>
        )}
      </section>

      {/* Lead funnel */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6">
        <h2 className="font-medium">Lead funnel</h2>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Funnel label="New" value={funnel.new} />
          <Funnel label="In progress" value={funnel.inProgress} accent="sky" />
          <Funnel label="Won" value={funnel.won} accent="emerald" />
          <Funnel label="Lost" value={funnel.lost} accent="red" />
        </div>
      </section>

      {/* Leads by source */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6">
        <h2 className="font-medium">Leads by source</h2>
        <ul className="mt-3 text-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
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

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "emerald" }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl sm:text-3xl font-semibold mt-1 tabular-nums ${accent === "emerald" ? "text-emerald-700" : ""}`}>{value}</div>
      {sub ? <div className="text-xs text-slate-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function PerfBlock({
  title,
  stats,
}: {
  title: string;
  stats: { total: number; connected: number; notPicked: number; talkSec: number; connectRate: number };
}) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        <div className="text-xs text-slate-500">{stats.connectRate}% picked up</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <Cell label="Calls" value={String(stats.total)} />
        <Cell label="Talk time" value={formatDuration(stats.talkSec)} />
        <Cell label="Picked" value={String(stats.connected)} accent="emerald" />
        <Cell label="Not picked" value={String(stats.notPicked)} accent="amber" />
      </div>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "amber" }) {
  const tint = accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tint}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Funnel({ label, value, accent }: { label: string; value: number; accent?: "sky" | "emerald" | "red" }) {
  const tint =
    accent === "emerald" ? "text-emerald-700" :
    accent === "sky" ? "text-sky-700" :
    accent === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${tint}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function KV({ label, value, accent, strong }: { label: string; value: string; accent?: "emerald"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${accent === "emerald" ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
