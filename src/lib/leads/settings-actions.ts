"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setSetting, SETTING_KEYS, type AutoAssignMode } from "@/lib/settings";
import { parseSheetUrl, syncConfiguredSheet } from "@/lib/integrations/sheet-sync";

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "MANAGER") redirect("/");

  const mode = String(formData.get("autoAssignMode") ?? "") as AutoAssignMode;
  const sheetUrl = String(formData.get("googleSheetUrl") ?? "").trim();
  const autoSyncSheet = formData.get("autoSyncSheet") ? "true" : "false";
  const slaMinutes = String(formData.get("slaMinutes") ?? "").trim();

  if (mode === "round_robin" || mode === "unassigned") {
    await setSetting(SETTING_KEYS.AUTO_ASSIGN_MODE, mode);
  }
  // Accept a pasted Google Sheets link; keep id/gid handy for reference.
  await setSetting(SETTING_KEYS.GOOGLE_SHEET_URL, sheetUrl);
  const parsed = parseSheetUrl(sheetUrl);
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

/** Manager taps "Sync now" — pull the configured sheet immediately. */
export async function syncSheetNowAction(): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "MANAGER") redirect("/");
  const r = await syncConfiguredSheet();
  const q = r.ok
    ? `synced=1&created=${r.created}&dups=${r.duplicates}&labeled=${r.labeled}&notes=${r.notes}`
    : `syncerr=${encodeURIComponent(r.reason ?? "failed")}`;
  revalidatePath("/manager/settings");
  revalidatePath("/leads");
  redirect(`/manager/settings?${q}`);
}
