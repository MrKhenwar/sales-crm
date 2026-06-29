import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLeadById, listActiveSalespeople } from "@/lib/leads/queries";
import { applyManualLabel, removeManualLabel, updateLead, assignLead, deleteLead } from "@/lib/leads/actions";
import { startCallForLead } from "@/lib/calls/actions";
import { AutoLabelChip, ManualLabelChip, MANUAL_LABELS } from "@/components/Labels";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { prisma } from "@/lib/prisma";
import { getCallStatsForLead, formatDuration } from "@/lib/calls/queries";
import type { ManualLabel } from "@/generated/prisma/enums";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const lead = await getLeadById({ id, userId: session.user.id, role: session.user.role });
  if (!lead) notFound();

  const role = session.user.role;
  const isManager = role === "MANAGER";
  const salespeople = isManager ? await listActiveSalespeople() : [];

  const applied = new Set<ManualLabel>(lead.labels.map((l) => l.label));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/leads" prefetch className="text-sm text-slate-500 hover:text-slate-800">← All leads</Link>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-2 break-words">{lead.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500 tabular-nums">
            <span>{lead.phone}</span>
            {lead.email ? <><span>•</span><span className="break-all">{lead.email}</span></> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <AutoLabelChip label={lead.autoLabel} />
            {lead.labels.map((l) => <ManualLabelChip key={l.label} label={l.label} />)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <form action={startCallForLead} className="contents">
            <input type="hidden" name="leadId" value={lead.id} />
            <button type="submit" className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2.5 hover:bg-emerald-700">
              Call
            </button>
          </form>
          <WhatsAppButton fullWidth phone={lead.phone} name={lead.name} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
          <h2 className="font-medium">Manual labels</h2>
          <p className="text-xs text-slate-500 mt-1">Stack on top of the call state. Click to toggle.</p>
          <div className="mt-4 flex gap-2 flex-wrap">
            {MANUAL_LABELS.map((label) => {
              const isOn = applied.has(label);
              const formAction = isOn ? removeManualLabel : applyManualLabel;
              return (
                <form key={label} action={formAction}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="label" value={label} />
                  <button
                    type="submit"
                    className={
                      isOn
                        ? "rounded-full text-xs font-semibold px-3 py-1 bg-slate-900 text-white"
                        : "rounded-full text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }
                  >
                    {label}
                  </button>
                </form>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
          <h2 className="font-medium">Details</h2>
          <form action={updateLead} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={lead.id} />
            <Field label="Name" name="name" defaultValue={lead.name} />
            <Field label="Email" name="email" defaultValue={lead.email ?? ""} type="email" />
            <Field label="Campaign" name="campaignName" defaultValue={lead.campaignName ?? ""} />
            <div className="flex justify-end">
              <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm px-3 py-2">Save</button>
            </div>
          </form>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-slate-500">Source</dt><dd className="text-slate-800">{lead.source}</dd>
            <dt className="text-slate-500">Created</dt><dd className="text-slate-800">{new Date(lead.createdAt).toLocaleString()}</dd>
            <dt className="text-slate-500">Last contact</dt><dd className="text-slate-800">{lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleString() : "Never"}</dd>
            <dt className="text-slate-500">Next redial</dt><dd className="text-slate-800">{lead.nextRedialAt ? new Date(lead.nextRedialAt).toLocaleString() : "—"}</dd>
            <dt className="text-slate-500">Assignee</dt><dd className="text-slate-800">{lead.assignedTo?.name ?? "Unassigned"}</dd>
          </dl>
        </section>
      </div>

      <CallHistory leadId={lead.id} />

      {isManager ? (
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
          <h2 className="font-medium">Reassign</h2>
          <form action={assignLead} className="mt-3 flex items-end gap-3 flex-wrap">
            <input type="hidden" name="leadId" value={lead.id} />
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Move to</span>
              <select name="toUserId" required defaultValue={lead.assignedToUserId ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="" disabled>Choose…</option>
                {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="text-sm flex-1 min-w-48">
              <span className="block text-slate-600 mb-1">Reason</span>
              <input name="reason" placeholder="optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm px-3 py-2">Reassign</button>
          </form>

          {lead.assignmentLogs.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Recent moves</h3>
              <ul className="mt-2 text-xs text-slate-600 space-y-1">
                {lead.assignmentLogs.map((log) => (
                  <li key={log.id} className="tabular-nums">
                    {new Date(log.createdAt).toLocaleString()} — {log.fromUser?.name ?? "Unassigned"} → {log.toUser?.name ?? "Unassigned"} (by {log.by.name}){log.reason ? `, ${log.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form action={deleteLead} className="mt-6 pt-6 border-t border-slate-100">
            <input type="hidden" name="leadId" value={lead.id} />
            <button type="submit" className="text-xs text-red-600 hover:underline">Delete lead</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function CallHistory({ leadId }: { leadId: string }) {
  const [calls, stats] = await Promise.all([
    prisma.call.findMany({
      where: { leadId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    getCallStatsForLead(leadId),
  ]);
  if (calls.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
      <h2 className="font-medium">Call history</h2>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Mini label="Times called" value={String(stats.total)} />
        <Mini label="Connected" value={String(stats.connected)} accent="emerald" />
        <Mini label="Not picked" value={String(stats.notPicked)} accent="amber" />
        <Mini label="Total talk time" value={formatDuration(stats.totalDurationSec)} />
        <Mini label="Avg connected" value={formatDuration(stats.avgConnectedSec)} />
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {calls.map((c) => (
          <li key={c.id} className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 sm:items-start text-sm">
            <div className="sm:col-span-3 flex items-center justify-between sm:block text-xs text-slate-500 tabular-nums">
              <span>{new Date(c.startedAt).toLocaleString()}</span>
              <span className="text-slate-400 sm:mt-0.5 sm:block">{c.user.name}</span>
            </div>
            <div className="sm:col-span-2 text-xs flex items-center gap-2 sm:block">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ring-1 text-[10px] font-semibold uppercase tracking-wide ${
                c.outcome === "CONNECTED" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                c.outcome === "NO_ANSWER" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                c.outcome === "BUSY" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                c.outcome === "FAILED" ? "bg-red-50 text-red-700 ring-red-200" :
                "bg-slate-100 text-slate-700 ring-slate-200"
              }`}>{c.outcome}</span>
              <span className="text-slate-500 tabular-nums sm:mt-0.5 sm:block">{c.durationSec ?? 0}s</span>
            </div>
            <div className="sm:col-span-4 text-[11px] text-slate-600 space-y-0.5">
              {c.fromNumber ? <div><span className="text-slate-400">from </span><span className="font-mono">{c.fromNumber}</span></div> : null}
              {c.agentPhone ? <div><span className="text-slate-400">agent </span><span className="font-mono">{c.agentPhone}</span></div> : null}
              {c.providerCallSid ? <div><span className="text-slate-400">sid </span><span className="font-mono truncate inline-block max-w-full align-bottom" title={c.providerCallSid}>{c.providerCallSid}</span></div> : null}
            </div>
            <div className="sm:col-span-3 text-xs text-slate-600 break-words">
              {c.feedbackNote ?? <span className="text-slate-400">no note</span>}
              {c.recordingUrl ? (
                <div className="mt-1">
                  <a className="underline text-slate-600 hover:text-slate-900" href={c.recordingUrl} target="_blank" rel="noreferrer">
                    recording ↗
                  </a>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "amber" }) {
  const tint =
    accent === "emerald" ? "text-emerald-700" :
    accent === "amber"   ? "text-amber-700"   : "text-slate-900";
  return (
    <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 tabular-nums ${tint}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
      />
    </label>
  );
}
