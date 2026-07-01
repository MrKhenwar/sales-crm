import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { ingestLead } from "@/lib/leads/ingest";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";
import type { ManualLabel, AutoLabel } from "@/generated/prisma/enums";

const AUTO_SYNC_THROTTLE_MS = 10 * 60_000;

/**
 * Sync a Meta Lead-Ads → Google Sheet into the CRM using the sheet's public
 * CSV export (no service account needed — the sheet must be shared as
 * "anyone with the link can view"). Maps the standard Meta columns to leads
 * and turns the team's hand-filled disposition columns (call 1 / 2nd call /
 * whatsapp update / response …) into CRM labels + a feedback note.
 */

export type SheetSyncResult = {
  ok: boolean;
  reason?: string;
  total: number;
  created: number;
  duplicates: number;
  labeled: number;
  notes: number;
  skipped: number;
};

/** Pull the spreadsheet id (and optional gid) out of a pasted Google Sheets URL. */
export function parseSheetUrl(input: string): { id: string; gid: string | null } | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  const idMatch =
    v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ?? v.match(/^([a-zA-Z0-9-_]{25,})$/);
  if (!idMatch) return null;
  const gidMatch = v.match(/[?#&]gid=(\d+)/);
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : null };
}

/**
 * Split the stored setting (many sheet links, one per line — or comma /
 * whitespace separated) into a de-duplicated list of individual sheet URLs.
 */
export function parseSheetUrls(input: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (input ?? "").split(/[\n,]+/)) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function csvExportUrl(id: string, gid: string | null): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function classifyHeaders(headers: string[]) {
  let name = -1, phone = -1, email = -1, campaign = -1;
  const disposition: number[] = [];
  headers.forEach((h, i) => {
    const n = norm(h);
    if (name < 0 && (n === "full name" || n === "name")) name = i;
    else if (phone < 0 && (n.includes("phone") || /whats ?app number/.test(n) || n === "number")) phone = i;
    else if (email < 0 && n.includes("email")) email = i;
    else if (campaign < 0 && n === "campaign name") campaign = i;

    const isDisposition =
      ((/\bcall\b/.test(n) && !n.includes("campaign")) ||
        n.includes("update") ||
        n.includes("response") ||
        n.includes("remark") ||
        n.includes("feedback") ||
        n.includes("comment") ||
        n.includes("status update")) &&
      n !== "lead status";
    if (isDisposition) disposition.push(i);
  });
  return { name, phone, email, campaign, disposition };
}

/** Strip Meta's "p:" prefix and surrounding junk from a phone cell. */
function cleanPhone(raw: string): string {
  return (raw ?? "").replace(/^p:/i, "").trim();
}

/** Map the free-text disposition the team wrote into CRM labels + a call state. */
export function deriveLabels(text: string): { labels: ManualLabel[]; autoLabel: AutoLabel | null } {
  const t = ` ${text.toLowerCase()} `;
  const labels = new Set<ManualLabel>();
  let autoLabel: AutoLabel | null = null;

  const has = (...needles: string[]) => needles.some((x) => t.includes(x));

  if (has("block")) labels.add("BLOCKED");
  if (has("incoming off", "offline", "switch off", "switched off", "phone off", "incoming bot")) labels.add("OFFLINE");
  if (has(" male", "male ", "gents", "boy")) labels.add("MALE");
  if (has("hindi")) labels.add("HINDI");
  if (has("other lang", "other language", "language", "kannada", "telugu", "tamil", "marathi")) labels.add("OTHER_LANGUAGE");
  if (has("wrong number", "wrong no", "no number", "koi form nhi", "kayka form", "kayka form")) labels.add("WRONG_NUMBER");
  if (has("busy", "bezy", "bzy", "party")) labels.add("BUSY");
  if (has("call cut", "cut call", "call declined", "declined", "cut kar", "call utha")) labels.add("CALL_CUT");
  if (has("not interest", "not intrest", "nhi chaiye", "nahi chahiye", "free of cost", "costly")) labels.add("NOT_INTERESTED");
  if (has("interested", "intrested")) labels.add("INTERESTED");
  if (has("call after", "call later", "call back", "callback", "call me", "connect after", "connect tomm", "call tomorrow", "revert", "will call", "call kreg", "batati", "batati hu", "batati huu")) labels.add("CALL_LATER");
  if (has("wp", "whatsapp", "shared details", "details on wp", "details share", "shared on wp", "share over whatsapp", "voice")) labels.add("WHATSAPP_SHARED");
  if (has("paid", "already paid", "customer")) labels.add("PAID");

  // Call state for the chips/filters.
  if (has("not answer", "not received", "not pick", " np", "np ", "unable to reach", "not connect", "no answer", "voicemail", "voucemail", "outgoing", "incoming off")) {
    autoLabel = "NOT_PICKED";
  }
  if (labels.has("INTERESTED") || labels.has("PAID")) autoLabel = "CONNECTED";

  return { labels: Array.from(labels), autoLabel };
}

export async function syncSheetFromUrl(url: string): Promise<SheetSyncResult> {
  const empty: SheetSyncResult = { ok: false, total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0 };
  const parsed = parseSheetUrl(url);
  if (!parsed) return { ...empty, reason: "bad_url" };

  let csv: string;
  try {
    const res = await fetch(csvExportUrl(parsed.id, parsed.gid), { cache: "no-store", redirect: "follow" });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || ct.includes("text/html")) return { ...empty, reason: "not_public" };
    csv = await res.text();
  } catch {
    return { ...empty, reason: "fetch_failed" };
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) return { ...empty, ok: true };
  const headers = rows[0];
  const col = classifyHeaders(headers);
  if (col.name < 0 || col.phone < 0) return { ...empty, reason: "columns_not_found" };

  const result: SheetSyncResult = { ok: true, total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0 };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (row[col.name] ?? "").trim();
    const phone = cleanPhone(row[col.phone] ?? "");
    if (!name || !phone) { result.skipped++; continue; }
    if (name.startsWith("<test lead") || phone.startsWith("<test lead") || name.toLowerCase() === "test lead") {
      result.skipped++; continue;
    }
    result.total++;

    const disposition = col.disposition
      .map((i) => (row[i] ?? "").trim())
      .filter(Boolean)
      .join(" · ");

    const ingest = await ingestLead({
      name,
      phone,
      email: col.email >= 0 ? (row[col.email] || null) : null,
      campaignName: col.campaign >= 0 ? (row[col.campaign] || null) : null,
      source: "SHEET",
      byUserId: null,
    });
    if (ingest.status === "error") { result.skipped++; continue; }
    if (ingest.status === "created") result.created++;
    else result.duplicates++;
    const leadId = ingest.leadId;

    // Labels + call state derived from the team's disposition text.
    if (disposition) {
      const { labels, autoLabel } = deriveLabels(disposition);
      for (const label of labels) {
        await prisma.leadLabel.upsert({
          where: { leadId_label: { leadId, label } },
          update: {},
          create: { leadId, label },
        });
        result.labeled++;
      }
      if (autoLabel) {
        await prisma.lead.update({ where: { id: leadId }, data: { autoLabel } });
      }

      // Feedback note — only once per identical text so re-syncs don't duplicate.
      const dup = await prisma.leadNote.findFirst({ where: { leadId, body: disposition }, select: { id: true } });
      if (!dup) {
        await prisma.leadNote.create({ data: { leadId, body: disposition } });
        result.notes++;
      }
    }
  }

  return result;
}

/**
 * Sync every sheet saved in settings (used by the manual button + scheduler).
 * The setting holds one or more sheet links; we pull each and add up the totals
 * so leads from all of them land in the CRM.
 */
export async function syncConfiguredSheet(): Promise<SheetSyncResult> {
  const urls = parseSheetUrls(await getSetting(SETTING_KEYS.GOOGLE_SHEET_URL));
  const empty = (extra?: Partial<SheetSyncResult>): SheetSyncResult => ({
    ok: false, total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0, ...extra,
  });
  if (urls.length === 0) return empty({ reason: "not_configured" });

  const agg: SheetSyncResult = { ok: true, total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0 };
  let lastReason: string | undefined;
  let anyOk = false;
  for (const url of urls) {
    const r = await syncSheetFromUrl(url);
    if (r.ok) {
      anyOk = true;
      agg.total += r.total;
      agg.created += r.created;
      agg.duplicates += r.duplicates;
      agg.labeled += r.labeled;
      agg.notes += r.notes;
      agg.skipped += r.skipped;
    } else {
      lastReason = r.reason;
    }
  }
  await setSetting(SETTING_KEYS.LAST_SHEET_SYNC, String(Date.now()));
  // If nothing synced successfully, surface the last failure reason.
  if (!anyOk) return empty({ reason: lastReason ?? "fetch_failed" });
  agg.ok = true;
  if (lastReason) agg.reason = lastReason; // partial success — some sheets failed
  return agg;
}

/**
 * Throttled auto-sync — safe to call from the hot ingest path. Runs the
 * configured sheet at most once per AUTO_SYNC_THROTTLE_MS when AUTO_SYNC_SHEET
 * is on. This is how the sheet stays in sync on serverless (no cron needed).
 */
export async function maybeAutoSyncSheet(): Promise<void> {
  if ((await getSetting(SETTING_KEYS.AUTO_SYNC_SHEET)) !== "true") return;
  if (!(await getSetting(SETTING_KEYS.GOOGLE_SHEET_URL))) return;
  const last = Number(await getSetting(SETTING_KEYS.LAST_SHEET_SYNC) ?? 0);
  if (Date.now() - last < AUTO_SYNC_THROTTLE_MS) return;
  // Mark first to avoid a stampede if two requests race.
  await setSetting(SETTING_KEYS.LAST_SHEET_SYNC, String(Date.now()));
  await syncConfiguredSheet();
}
