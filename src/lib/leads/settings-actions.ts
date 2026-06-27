"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setSetting, SETTING_KEYS, type AutoAssignMode } from "@/lib/settings";

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "MANAGER") redirect("/");

  const mode = String(formData.get("autoAssignMode") ?? "") as AutoAssignMode;
  const sheetId = String(formData.get("googleSheetId") ?? "").trim();
  const sheetRange = String(formData.get("googleSheetRange") ?? "").trim();
  const autoSyncSheet = formData.get("autoSyncSheet") ? "true" : "false";
  const slaMinutes = String(formData.get("slaMinutes") ?? "").trim();

  if (mode === "round_robin" || mode === "unassigned") {
    await setSetting(SETTING_KEYS.AUTO_ASSIGN_MODE, mode);
  }
  await setSetting(SETTING_KEYS.GOOGLE_SHEET_ID, sheetId);
  await setSetting(SETTING_KEYS.GOOGLE_SHEET_RANGE, sheetRange);
  await setSetting("AUTO_SYNC_SHEET", autoSyncSheet);
  if (slaMinutes && /^\d+$/.test(slaMinutes)) {
    await setSetting("SLA_CONNECT_MINUTES", slaMinutes);
  }
  revalidatePath("/manager/settings");
  redirect("/manager/settings?saved=1");
}
