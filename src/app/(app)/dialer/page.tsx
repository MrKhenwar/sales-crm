import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { nextLeadInQueue, getActiveSession, getCallById, todayCallStats } from "@/lib/calls/queries";
import { startCallForLead, startCallSession, pauseCallSession, endCallSession, submitCallFeedback } from "@/lib/calls/actions";
import { DialerLive } from "@/components/Dialer";
import { DirectCallPanel } from "@/components/DirectCallPanel";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { AutoLabelChip } from "@/components/Labels";

export default async function DialerPage({
  searchParams,
}: {
  searchParams: Promise<{ activeCallId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "MANAGER") redirect("/manager");

  const sp = await searchParams;
  const activeCallId = sp.activeCallId ?? null;

  const [active, lead, todayStats, activeCall] = await Promise.all([
    getActiveSession(session.user.id),
    nextLeadInQueue(session.user.id),
    todayCallStats(session.user.id),
    activeCallId ? getCallById(activeCallId) : Promise.resolve(null),
  ]);

  const isPaused = !!(active && active.pausedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Auto-dialer</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {active
              ? isPaused
                ? "Session paused. Resume to continue dialing."
                : "Session live. Hit Call to dial the next lead."
              : "Hit Start to begin a calling session."}
          </p>
        </div>
        <div className="flex gap-2">
          {!active ? (
            <form action={startCallSession}>
              <button type="submit" className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2 hover:bg-emerald-700">
                Start session
              </button>
            </form>
          ) : (
            <>
              <form action={pauseCallSession}>
                <button type="submit" className="rounded-lg bg-slate-100 text-slate-700 text-sm font-medium px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-200">
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </form>
              <form action={endCallSession}>
                <button type="submit" className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50">
                  End session
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Calls today" value={todayStats.total} />
        <Stat label="Connected" value={todayStats.connected} />
        <Stat label="Not picked" value={todayStats.notPicked} />
      </div>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-medium">Next in queue</h2>
        {!lead ? (
          <p className="mt-3 text-sm text-slate-500">No leads waiting. New leads or redials will appear here automatically.</p>
        ) : (
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <Link href={`/leads/${lead.id}`} prefetch className="font-medium hover:underline">{lead.name}</Link>
              <div className="text-xs text-slate-500 tabular-nums mt-0.5">{lead.phone}</div>
              {lead.campaignName ? <div className="text-xs text-slate-400 mt-0.5">{lead.campaignName}</div> : null}
              <div className="mt-2"><AutoLabelChip label={lead.autoLabel} /></div>
            </div>
            <div className="flex gap-2">
              <WhatsAppButton compact phone={lead.phone} name={lead.name} />
              {active && !isPaused ? (
                <form action={startCallForLead}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="sessionId" value={active.id} />
                  <button type="submit" className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700">
                    Call
                  </button>
                </form>
              ) : (
                <button type="button" disabled className="rounded-lg bg-slate-100 text-slate-400 text-sm font-medium px-4 py-2 cursor-not-allowed">
                  {active ? "Paused" : "Start session first"}
                </button>
              )}
            </div>
          </div>
        )}

        {activeCall && activeCall.provider === "direct" ? (
          <DirectCallPanel
            callId={activeCall.id}
            lead={activeCall.lead}
            submitFeedbackAction={submitCallFeedback}
          />
        ) : (
          <DialerLive
            activeCallId={activeCallId}
            initialCall={activeCall ? {
              id: activeCall.id,
              outcome: activeCall.outcome,
              startedAt: activeCall.startedAt?.toISOString() ?? null,
              answeredAt: activeCall.answeredAt?.toISOString() ?? null,
              endedAt: activeCall.endedAt?.toISOString() ?? null,
              durationSec: activeCall.durationSec,
              recordingUrl: activeCall.recordingUrl,
              feedbackNote: activeCall.feedbackNote,
              lead: activeCall.lead,
            } : null}
            submitFeedbackAction={submitCallFeedback}
          />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
