import type { IngestInput } from "@/lib/leads/ingest";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

export type SheetSyncStatus =
  | { ok: false; reason: "not_configured" | "no_creds" | "no_sheet" }
  | { ok: true; rows: Array<Omit<IngestInput, "source">> };

const DEFAULT_RANGE = "Sheet1!A2:E";

function parseRow(row: string[]): Omit<IngestInput, "source"> | null {
  const [name, phone, email, campaign] = row.map((c) => (c ?? "").toString().trim());
  if (!name || !phone) return null;
  return {
    name,
    phone,
    email: email || null,
    campaignName: campaign || null,
  };
}

export async function readSheetRows(): Promise<SheetSyncStatus> {
  const sheetId = await getSetting(SETTING_KEYS.GOOGLE_SHEET_ID);
  const range = (await getSetting(SETTING_KEYS.GOOGLE_SHEET_RANGE)) || DEFAULT_RANGE;
  if (!sheetId) return { ok: false, reason: "no_sheet" };

  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!creds) return { ok: false, reason: "no_creds" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(creds);
  } catch {
    return { ok: false, reason: "no_creds" };
  }

  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: parsed.client_email as string,
    key: parsed.private_key as string,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values = (res.data.values ?? []) as string[][];
  const rows = values.map(parseRow).filter((r): r is Omit<IngestInput, "source"> => r !== null);
  return { ok: true, rows };
}
