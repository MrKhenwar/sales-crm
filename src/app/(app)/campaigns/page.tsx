import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCampaigns } from "@/lib/leads/queries";

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const campaigns = await listCampaigns({ userId: session.user.id, role: session.user.role });
  const totalLeads = campaigns.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Leads grouped by campaign. {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · {totalLeads} leads.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-12 text-center text-slate-500">
          No campaigns yet. Leads get a campaign when they arrive from Meta/Sheet or when you set one on a new lead.
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.name}>
              <Link
                href={`/leads?campaign=${encodeURIComponent(c.name)}`}
                prefetch
                className="flex items-center justify-between gap-3 rounded-2xl bg-white ring-1 ring-slate-200 p-4 hover:bg-slate-50 transition"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">View leads →</div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold px-3 py-1 tabular-nums">
                  {c.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
