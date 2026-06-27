/**
 * Tiny CSV parser — handles commas in quoted fields and "" escapes.
 * Good enough for human-pasted lead lists; not RFC-4180 perfect.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      cur.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (field !== "" || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      }
      // swallow CRLF as single break
      if (c === "\r" && input[i + 1] === "\n") i++;
      continue;
    }
    field += c;
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

export type CsvLeadRow = { name: string; phone: string; email?: string; campaign?: string };

const HEADER_ALIASES: Record<string, keyof CsvLeadRow> = {
  name: "name",
  "full name": "name",
  phone: "phone",
  mobile: "phone",
  number: "phone",
  email: "email",
  "e-mail": "email",
  campaign: "campaign",
  "campaign name": "campaign",
  source: "campaign",
};

export function parseCsvLeads(input: string): { rows: CsvLeadRow[]; rejected: number } {
  const all = parseCsv(input).filter((r) => r.some((c) => c.trim().length > 0));
  if (all.length === 0) return { rows: [], rejected: 0 };
  const header = all[0].map((c) => c.trim().toLowerCase());
  const mapped = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!mapped.includes("name") || !mapped.includes("phone")) {
    // No header detected — assume positional: name, phone, email, campaign
    const rows: CsvLeadRow[] = [];
    let rejected = 0;
    for (const r of all) {
      const [name, phone, email, campaign] = r.map((c) => c.trim());
      if (!name || !phone) { rejected++; continue; }
      rows.push({ name, phone, email: email || undefined, campaign: campaign || undefined });
    }
    return { rows, rejected };
  }

  const rows: CsvLeadRow[] = [];
  let rejected = 0;
  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    const out: Partial<CsvLeadRow> = {};
    for (let j = 0; j < mapped.length; j++) {
      const key = mapped[j];
      if (!key) continue;
      out[key] = (r[j] ?? "").trim();
    }
    if (!out.name || !out.phone) { rejected++; continue; }
    rows.push(out as CsvLeadRow);
  }
  return { rows, rejected };
}
