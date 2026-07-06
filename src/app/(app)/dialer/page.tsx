import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { nextLeadInQueue, getCallById } from "@/lib/calls/queries";
import { submitCallFeedback } from "@/lib/calls/actions";
import { CallButton } from "@/components/CallButton";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { DirectCallPanel } from "@/components/DirectCallPanel";
import { AutoLabelChip } from "@/components/Labels";

/**
 * Manual auto-dialer loop. Shows one lead at a time with a Call button; tapping
 * Call opens the phone's dialer and records the call, then the salesperson logs
 * feedback (saved to the lead's notes) and the NEXT lead appears automatically.
 * No auto-dialing and no auto-advance — every step is a manual tap.
 */
export default async function DialerPage({
  searchParams,
}: {
  searchParams: Promise<{ activeCallId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { activeCallId } = await searchParams;

  // If a call is in progress, show the feedback panel for it.
  const activeCall = activeCallId ? await getCallById(activeCallId) : null;
  if (activeCall && activeCall.outcome === "PENDING" && activeCall.userId === session.user.id) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6">
          <h2 className="font-medium">Log this call</h2>
          <p className="text-xs text-slate-500 mt-1">Record the outcome and a note — it saves to the lead and loads the next one.</p>
          <DirectCallPanel
            callId={activeCall.id}
            lead={{ id: activeCall.lead.id, name: activeCall.lead.name, phone: activeCall.lead.phone }}
            submitFeedbackAction={submitCallFeedback}
            returnTo="dialer"
          />
        </div>
      </Shell>
    );
  }

  // Otherwise, show the next lead in the queue.
  const lead = await nextLeadInQueue(session.user.id);
  const [remaining, doneToday] = await Promise.all([
    prisma.lead.count({
      where: {
        assignedToUserId: session.user.id,
        status: { in: ["NEW", "IN_PROGRESS"] },
        OR: [{ lastContactedAt: null }, { nextRedialAt: { lte: new Date() } }],
      },
    }),
    prisma.call.count({ where: { userId: session.user.id, startedAt: { gte: startOfToday() } } }),
  ]);

  if (!lead) {
    return (
      <Shell doneToday={doneToday}>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-16 text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-3 font-semibold text-lg">You&apos;re all caught up</h2>
          <p className="mt-1 text-sm text-slate-500">No leads waiting to be called right now.</p>
          <Link href="/leads" prefetch className="mt-5 inline-block rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
            Back to leads
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell doneToday={doneToday} remaining={remaining}>
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-center">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">Next up</div>
        <Link href={`/leads/${lead.id}`} prefetch className="mt-1 inline-block text-2xl font-semibold tracking-tight hover:underline">
          {lead.name}
        </Link>
        <div className="mt-1 text-slate-500 tabular-nums">{lead.phone}</div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
          <span>{lead.source}</span>
          {lead.campaignName ? <><span>·</span><span>{lead.campaignName}</span></> : null}
          <AutoLabelChip label={lead.autoLabel} />
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
          <CallButton fullWidth leadId={lead.id} phone={lead.phone} returnTo="dialer" />
          <WhatsAppButton fullWidth phone={lead.phone} name={lead.name} />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Tap Call to open your phone&apos;s dialer. After the call, log feedback and the next lead appears.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, doneToday, remaining }: { children: React.ReactNode; doneToday?: number; remaining?: number }) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Dialer</h1>
          <p className="text-slate-500 mt-1 text-sm">Call your queue one lead at a time.</p>
        </div>
        <div className="flex gap-4 text-right">
          {typeof remaining === "number" ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums">{remaining}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">In queue</div>
            </div>
          ) : null}
          {typeof doneToday === "number" ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums text-emerald-700">{doneToday}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Called today</div>
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
