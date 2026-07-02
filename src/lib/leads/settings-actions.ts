"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setSetting, SETTING_KEYS, type AutoAssignMode } from "@/lib/settings";
import { parseSheetUrl, parseSheetUrls, syncConfiguredSheet, type SheetSyncResult } from "@/lib/integrations/sheet-sync";

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const mode = String(formData.get("autoAssignMode") ?? "") as AutoAssignMode;
  // Multiple sheet links can be pasted (one input per row). Keep them one-per-line.
  const sheetUrls = parseSheetUrls(
    formData.getAll("googleSheetUrl").map((v) => String(v)).join("\n"),
  );
  const autoSyncSheet = formData.get("autoSyncSheet") ? "true" : "false";
  const slaMinutes = String(formData.get("slaMinutes") ?? "").trim();

  if (mode === "round_robin" || mode === "unassigned") {
    await setSetting(SETTING_KEYS.AUTO_ASSIGN_MODE, mode);
  }
  // Accept one or more pasted Google Sheets links; keep the first id/gid handy for reference.
  await setSetting(SETTING_KEYS.GOOGLE_SHEET_URL, sheetUrls.join("\n"));
  const parsed = sheetUrls.map(parseSheetUrl).find(Boolean);
  if (parsed) {
    await setSetting(SETTING_KEYS.GOOGLE_SHEET_ID, parsed.id);
    await setSetting(SETTING_KEYS.GOOGLE_SHEET_RANGE, parsed.gid ?? "");
  }
  await setSetting(SETTING_KEYS.AUTO_SYNC_SHEET, autoSyncSheet);
  if (slaMinutes && /^\d+$/.test(slaMinutes)) {
    await setSetting("SLA_CONNECT_MINUTES", slaMinutes);
  }
  revalidatePath("/manager/settings");
  redirect("/manager/settings?saved=1");
}

/**
 * Sync button used across the app (client-invoked). Returns the result instead
 * of redirecting so the button can show inline status and "always work" wherever
 * it's placed. Never throws — errors come back as `{ ok: false, reason }`.
 */
export async function runSheetSyncNow(): Promise<SheetSyncResult> {
  const session = await auth();
  // Pulling from the configured Google Sheets is a manager/ingestion concern.
  // Salespeople sync their *call logs* from the Android app instead.
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, reason: "forbidden", total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0 };
  }
  let r: SheetSyncResult;
  try {
    r = await syncConfiguredSheet();
  } catch {
    r = { ok: false, reason: "fetch_failed", total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0 };
  }
  revalidatePath("/leads");
  revalidatePath("/manager/settings");
  return r;
}
