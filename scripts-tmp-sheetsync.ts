import "dotenv/config";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { syncConfiguredSheet } from "@/lib/integrations/sheet-sync";

const URL = "https://docs.google.com/spreadsheets/d/13otzZj-8uFvCs5zf_CYdELYn1LYWIv-tOfyEsOkEJNo/edit?gid=804846589#gid=804846589";

async function main() {
  await setSetting(SETTING_KEYS.GOOGLE_SHEET_URL, URL);
  await setSetting(SETTING_KEYS.AUTO_SYNC_SHEET, "true");
  const r = await syncConfiguredSheet();
  console.log("RESULT", JSON.stringify(r));
}
main().catch((e) => { console.error("ERR", e); process.exit(2); }).finally(() => process.exit(0));
