import crypto from "node:crypto";
import type { IngestInput } from "@/lib/leads/ingest";

/** Constant-time signature check for Meta's X-Hub-Signature-256 header. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string
): boolean {
  if (!header || !appSecret) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type MetaFieldData = { name: string; values: string[] };

/**
 * Fetch full lead data from Graph API. Returns the field_data array.
 * In dev (no token), returns a synthetic stub so the pipeline can be exercised end-to-end.
 */
export async function fetchMetaLead(leadgenId: string): Promise<MetaFieldData[]> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return [
      { name: "full_name", values: [`Test Lead ${leadgenId.slice(-4)}`] },
      { name: "phone_number", values: [`+9198${leadgenId.replace(/\D/g, "").slice(-8).padStart(8, "9")}`] },
      { name: "email", values: [`lead${leadgenId.slice(-4)}@example.com`] },
    ];
  }
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(token)}&fields=field_data,created_time,ad_id,form_id,campaign_id`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta Graph fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { field_data?: MetaFieldData[] };
  return json.field_data ?? [];
}

function pick(field_data: MetaFieldData[], names: string[]): string | undefined {
  for (const n of names) {
    const f = field_data.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (f && f.values?.[0]) return f.values[0];
  }
  return undefined;
}

export function metaFieldsToIngest(
  field_data: MetaFieldData[],
  campaignName: string | undefined
): Omit<IngestInput, "source"> | null {
  const name =
    pick(field_data, ["full_name", "name"]) ??
    [pick(field_data, ["first_name"]), pick(field_data, ["last_name"])]
      .filter(Boolean)
      .join(" ")
      .trim();
  const phone = pick(field_data, ["phone_number", "phone"]);
  if (!name || !phone) return null;
  return {
    name,
    phone,
    email: pick(field_data, ["email"]) ?? null,
    campaignName: campaignName ?? null,
    adFormData: { field_data },
  };
}
