import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncConfiguredSheet, type SheetSyncResult } from "@/lib/integrations/sheet-sync";

export const runtime = "nodejs";
// Give a big first sync (all tabs, backfill) room to finish without a 504.
export const maxDuration = 60;

const fail = (reason: string): SheetSyncResult => ({
  ok: false, reason, total: 0, created: 0, duplicates: 0, labeled: 0, notes: 0, skipped: 0,
});

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json(fail("forbidden"), { status: 403 });
  }
  let result: SheetSyncResult;
  try {
    result = await syncConfiguredSheet();
  } catch {
    result = fail("fetch_failed");
  }
  revalidatePath("/leads");
  revalidatePath("/manager");
  return NextResponse.json(result);
}
