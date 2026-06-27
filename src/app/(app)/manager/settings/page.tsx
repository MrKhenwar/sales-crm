import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllSettings, getAutoAssignMode, SETTING_KEYS } from "@/lib/settings";
import { updateSettingsAction } from "@/lib/leads/settings-actions";
import { syncSheetAction } from "@/lib/leads/import-actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "MANAGER") redirect("/");

  const [settings, mode, sp, h] = await Promise.all([
    getAllSettings(),
    getAutoAssignMode(),
    searchParams,
    headers(),
  ]);
  const host = h.get("host") ?? "localhost:3000";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0];
  const origin = `${proto}://${host}`;
  const webhookUrl = `${origin}/api/webhooks/meta`;
  const cronUrl = `${origin}/api/cron/sync-sheet?secret=YOUR_CRON_SECRET`;
  const sheetId = settings[SETTING_KEYS.GOOGLE_SHEET_ID] ?? "";
  const sheetRange = settings[SETTING_KEYS.GOOGLE_SHEET_RANGE] ?? "";
  const autoSyncSheet = settings["AUTO_SYNC_SHEET"] === "true";
  const slaMinutes = settings["SLA_CONNECT_MINUTES"] ?? "5";
  const hasGoogleCreds = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const hasMetaCreds = Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN);
  const metaDevBypass = process.env.META_DEV_MODE === "true";

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/manager" prefetch className="text-sm text-slate-500 hover:text-slate-800">← Manager</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Ingestion settings</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Configure how new leads are assigned and where they come from.
        </p>
      </div>

      {sp.saved ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">Settings saved.</div>
      ) : null}
      {sp.sync === "ok" ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">
          Synced: {sp.created} created · {sp.duplicates} dups · {sp.errors} errors
        </div>
      ) : null}
      {sp.sync === "fail" ? (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-sm px-3 py-2 ring-1 ring-amber-100">
          Sync failed: {sp.reason}
        </div>
      ) : null}

      <form action={updateSettingsAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-5">
        <h2 className="font-medium">Auto-assignment</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-3 text-sm">
            <input type="radio" name="autoAssignMode" value="round_robin" defaultChecked={mode === "round_robin"} />
            <div>
              <div className="font-medium">Round-robin</div>
              <div className="text-slate-500 text-xs">Cycle new leads through active salespeople in order.</div>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="radio" name="autoAssignMode" value="unassigned" defaultChecked={mode === "unassigned"} />
            <div>
              <div className="font-medium">Leave unassigned</div>
              <div className="text-slate-500 text-xs">Manager assigns each lead manually.</div>
            </div>
          </label>
        </div>

        <h2 className="font-medium pt-4 border-t border-slate-100">Google Sheet</h2>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Spreadsheet ID</span>
          <input
            name="googleSheetId"
            defaultValue={sheetId}
            placeholder="From the sheet URL"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none font-mono"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Range</span>
          <input
            name="googleSheetRange"
            defaultValue={sheetRange || "Sheet1!A2:E"}
            placeholder="Sheet1!A2:E"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none font-mono"
          />
        </label>
        <p className="text-xs text-slate-500">
          Columns assumed positional: <code>name, phone, email, campaign</code>.
          {hasGoogleCreds ? null : (
            <span className="text-amber-700"> Google service account not configured yet — set <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> in <code>.env</code>.</span>
          )}
        </p>

        <label className="flex items-center gap-3 text-sm pt-2">
          <input type="checkbox" name="autoSyncSheet" defaultChecked={autoSyncSheet} />
          <div>
            <div className="font-medium">Continuously sync the sheet</div>
            <div className="text-slate-500 text-xs">Pulls new rows every 5 minutes automatically.</div>
          </div>
        </label>

        <h2 className="font-medium pt-4 border-t border-slate-100">SLA — connect-within-N-minutes</h2>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">SLA in minutes</span>
          <input
            name="slaMinutes"
            type="number"
            min="1"
            defaultValue={slaMinutes}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            If a new lead isn't <strong>connected</strong> within this many minutes of assignment, the salesperson and all active managers get a notification.
          </span>
        </label>

        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">Save</button>
        </div>
      </form>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-3">
        <h2 className="font-medium">Sync now</h2>
        <p className="text-xs text-slate-500">Pull rows from the configured Sheet and ingest them.</p>
        <form action={syncSheetAction}>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">Run sync</button>
        </form>
      </div>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-3">
        <h2 className="font-medium">Meta webhook</h2>
        <p className="text-xs text-slate-500">Configure this URL + verify token in Meta App Dashboard → Webhooks → Page → leadgen.</p>
        <dl className="text-xs grid grid-cols-3 gap-y-1">
          <dt className="text-slate-500">Callback URL</dt>
          <dd className="col-span-2 font-mono break-all">{webhookUrl}</dd>
          <dt className="text-slate-500">Verify token</dt>
          <dd className="col-span-2 font-mono">{process.env.META_VERIFY_TOKEN ?? <span className="text-amber-700">not set</span>}</dd>
          <dt className="text-slate-500">App secret</dt>
          <dd className="col-span-2">{hasMetaCreds ? "configured" : <span className="text-amber-700">not set</span>}</dd>
          <dt className="text-slate-500">Dev bypass</dt>
          <dd className="col-span-2">{metaDevBypass ? <span className="text-amber-700">enabled — DO NOT use in prod</span> : "disabled"}</dd>
        </dl>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-3">
        <h2 className="font-medium">Cron endpoint</h2>
        <p className="text-xs text-slate-500">Point any external scheduler (Vercel cron, GitHub Action, system cron) at:</p>
        <code className="block text-xs font-mono break-all bg-slate-50 ring-1 ring-slate-200 rounded px-3 py-2">{cronUrl}</code>
      </section>
    </div>
  );
}
