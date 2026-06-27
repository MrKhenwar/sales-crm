"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseCsvLeads } from "@/lib/csv";
import { ingestBulk } from "@/lib/leads/ingest";
import { readSheetRows } from "@/lib/integrations/google-sheets";

export async function importCsvAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "MANAGER") redirect("/");

  let csv = String(formData.get("csv") ?? "").trim();
  const file = formData.get("file") as File | null;
  if ((!csv || csv.length === 0) && file && typeof file.text === "function") {
    csv = (await file.text()).trim();
  }
  if (!csv) redirect("/leads/import?error=" + encodeURIComponent("Paste CSV or upload a file"));

  const { rows, rejected } = parseCsvLeads(csv);
  const summary = await ingestBulk(rows.map((r) => ({
    name: r.name,
    phone: r.phone,
    email: r.email ?? null,
    campaignName: r.campaign ?? null,
    source: "MANUAL",
    byUserId: session.user.id,
  })));
  revalidatePath("/leads");
  const q = new URLSearchParams({
    created: String(summary.created),
    duplicates: String(summary.duplicates),
    errors: String(summary.errors + rejected),
  });
  redirect(`/leads/import?${q.toString()}`);
}

export async function syncSheetAction(): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "MANAGER") redirect("/");

  const status = await readSheetRows();
  if (!status.ok) {
    redirect(`/manager/settings?sync=fail&reason=${status.reason}`);
  }
  const summary = await ingestBulk(status.rows.map((r) => ({
    ...r,
    source: "SHEET",
    byUserId: session.user.id,
  })));
  revalidatePath("/leads");
  const q = new URLSearchParams({
    sync: "ok",
    created: String(summary.created),
    duplicates: String(summary.duplicates),
    errors: String(summary.errors),
  });
  redirect(`/manager/settings?${q.toString()}`);
}
