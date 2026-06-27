import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAutoAssignMode } from "@/lib/settings";

export default async function ManagerHome() {
  const session = await auth();
  if (session?.user.role !== "MANAGER") redirect("/");

  const [totalUsers, activeSalespeople, totalLeads, leadsBySource, mode] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "SALESPERSON", active: true } }),
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
    getAutoAssignMode(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manager dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Stats below; full per-salesperson breakdown and shuffle UI lands in Phase 6.
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
        <Stat label="Total leads" value={totalLeads} />
        <Stat label="Active salespeople" value={activeSalespeople} />
        <Stat label="Total users" value={totalUsers} />
        <Stat label="Auto-assign" value={mode === "round_robin" ? "Round-robin" : "Unassigned"} />
      </div>

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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </div>
  );
}
