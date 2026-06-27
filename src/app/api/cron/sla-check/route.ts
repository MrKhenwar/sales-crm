import { NextRequest, NextResponse } from "next/server";
import { runSlaCheck } from "@/lib/sla";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  // Vercel Cron also signs requests with a bearer header — accept either.
  const vercelHeader = req.headers.get("authorization") === `Bearer ${expected}`;
  const got = req.nextUrl.searchParams.get("secret");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!expected || (!vercelHeader && got !== expected && !isVercelCron)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runSlaCheck();
  return NextResponse.json({ ok: true, ...result });
}
