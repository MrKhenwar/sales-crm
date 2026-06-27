import { NextRequest, NextResponse } from "next/server";
import { readSheetRows } from "@/lib/integrations/google-sheets";
import { ingestBulk } from "@/lib/leads/ingest";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const vercelHeader = req.headers.get("authorization") === `Bearer ${expected}`;
  const got = req.nextUrl.searchParams.get("secret");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!expected || (!vercelHeader && got !== expected && !isVercelCron)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = await readSheetRows();
  if (!status.ok) {
    return NextResponse.json({ ok: false, reason: status.reason }, { status: 200 });
  }
  const summary = await ingestBulk(status.rows.map((r) => ({ ...r, source: "SHEET" })));
  return NextResponse.json({ ok: true, ...summary });
}
