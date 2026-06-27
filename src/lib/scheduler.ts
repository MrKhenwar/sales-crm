/**
 * In-process scheduler that runs SLA + Sheet sync on intervals.
 * Survives a single Node process; restarted on every dev-server reload.
 * For production behind a serverless platform, swap this for Vercel Cron
 * or any external scheduler hitting /api/cron/*.
 */
import { runSlaCheck } from "@/lib/sla";
import { readSheetRows } from "@/lib/integrations/google-sheets";
import { ingestBulk } from "@/lib/leads/ingest";
import { getSetting } from "@/lib/settings";

declare global {
  // eslint-disable-next-line no-var
  var __crmScheduler__: { started: boolean } | undefined;
}

const SHEET_SYNC_INTERVAL_MS = 5 * 60_000;
const SLA_CHECK_INTERVAL_MS = 60_000;
const SETTING_AUTO_SYNC_SHEET = "AUTO_SYNC_SHEET";

let sheetSyncInFlight = false;
let slaInFlight = false;

async function tickSlaCheck() {
  if (slaInFlight) return;
  slaInFlight = true;
  try {
    const r = await runSlaCheck();
    if (r.notified > 0) console.log(`[scheduler] SLA: ${r.checked} candidates → ${r.notified} new notifications`);
  } catch (e) {
    console.error("[scheduler] SLA check failed:", (e as Error).message);
  } finally {
    slaInFlight = false;
  }
}

async function tickSheetSync() {
  if (sheetSyncInFlight) return;
  const enabled = (await getSetting(SETTING_AUTO_SYNC_SHEET)) === "true";
  if (!enabled) return;
  sheetSyncInFlight = true;
  try {
    const status = await readSheetRows();
    if (!status.ok) {
      // silent — no sheet configured yet is normal
      return;
    }
    const summary = await ingestBulk(status.rows.map((r) => ({ ...r, source: "SHEET" })));
    if (summary.created > 0) {
      console.log(`[scheduler] Sheet sync: ${summary.created} new leads`);
    }
  } catch (e) {
    console.error("[scheduler] Sheet sync failed:", (e as Error).message);
  } finally {
    sheetSyncInFlight = false;
  }
}

export function startScheduler(): void {
  if (globalThis.__crmScheduler__?.started) return;
  globalThis.__crmScheduler__ = { started: true };

  // Run one tick on boot then on intervals.
  void tickSlaCheck();
  void tickSheetSync();
  setInterval(tickSlaCheck, SLA_CHECK_INTERVAL_MS);
  setInterval(tickSheetSync, SHEET_SYNC_INTERVAL_MS);
  console.log("[scheduler] started — SLA every 60s, Sheet sync every 5 min (when enabled)");
}
