import { prisma } from "@/lib/prisma";
import { getAutoAssignMode } from "@/lib/settings";
import type { LeadSource } from "@/generated/prisma/enums";

export type IngestInput = {
  name: string;
  phone: string; // E.164
  email?: string | null;
  source: LeadSource;
  campaignName?: string | null;
  adFormData?: unknown;
  // If set, skips round-robin and uses this user (e.g., for manual creation)
  assignToUserId?: string | null;
  // For audit log; defaults to "system" for webhooks/sync
  byUserId?: string | null;
};

export type IngestResult =
  | { status: "created"; leadId: string; assignedToUserId: string | null }
  | { status: "duplicate"; leadId: string }
  | { status: "error"; error: string };

const phoneRegex = /^\+\d{8,15}$/;

function normalizePhone(raw: string): string | null {
  let p = raw.trim().replace(/[\s\-()]/g, "");
  if (!p.startsWith("+")) {
    const digits = p.replace(/[^\d]/g, "");
    if (digits.length === 10) p = "+91" + digits; // assume India if 10 digits
    else if (digits.length > 10) p = "+" + digits;
    else return null;
  }
  return phoneRegex.test(p) ? p : null;
}

/**
 * Pick the next salesperson for round-robin. Cursor-based, stable across calls.
 * Falls back to null if no active salespeople.
 */
async function pickRoundRobinAssignee(): Promise<string | null> {
  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (salespeople.length === 0) return null;

  // Atomically bump the cursor and select.
  const cursor = await prisma.assignmentCursor.upsert({
    where: { id: 1 },
    update: { cursor: { increment: 1 } },
    create: { id: 1, cursor: 1 },
  });
  const idx = (cursor.cursor - 1) % salespeople.length;
  return salespeople[idx].id;
}

export async function ingestLead(input: IngestInput): Promise<IngestResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "error", error: "Invalid phone number" };
  const name = (input.name ?? "").trim();
  if (!name) return { status: "error", error: "Name is required" };

  // De-dup by phone
  const existing = await prisma.lead.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (existing) return { status: "duplicate", leadId: existing.id };

  // Determine assignee
  let assignedToUserId: string | null = input.assignToUserId ?? null;
  if (assignedToUserId === null) {
    const mode = await getAutoAssignMode();
    if (mode === "round_robin") {
      assignedToUserId = await pickRoundRobinAssignee();
    }
  }

  const lead = await prisma.lead.create({
    data: {
      name,
      phone,
      email: input.email || null,
      source: input.source,
      campaignName: input.campaignName || null,
      adFormData:
        input.adFormData === undefined || input.adFormData === null
          ? undefined
          : (input.adFormData as object),
      assignedToUserId,
    },
    select: { id: true },
  });

  // Audit log + notification stub (Phase 5 will wire real-time delivery)
  const byUserId = input.byUserId ?? null;
  await prisma.$transaction(async (tx) => {
    if (assignedToUserId && byUserId) {
      await tx.assignmentLog.create({
        data: {
          leadId: lead.id,
          fromUserId: null,
          toUserId: assignedToUserId,
          byUserId,
          reason: `Auto-assigned on ${input.source.toLowerCase()} ingest`,
        },
      });
    }
    if (assignedToUserId) {
      await tx.notification.create({
        data: {
          userId: assignedToUserId,
          type: "NEW_LEAD",
          leadId: lead.id,
          message: `New lead assigned: ${name}`,
        },
      });
    }
  });

  return { status: "created", leadId: lead.id, assignedToUserId };
}

export type BulkIngestSummary = {
  total: number;
  created: number;
  duplicates: number;
  errors: number;
  errorDetails: Array<{ row: number; error: string }>;
};

export async function ingestBulk(inputs: IngestInput[]): Promise<BulkIngestSummary> {
  const summary: BulkIngestSummary = {
    total: inputs.length,
    created: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
  };
  for (let i = 0; i < inputs.length; i++) {
    const r = await ingestLead(inputs[i]);
    if (r.status === "created") summary.created++;
    else if (r.status === "duplicate") summary.duplicates++;
    else {
      summary.errors++;
      summary.errorDetails.push({ row: i + 1, error: r.error });
    }
  }
  return summary;
}
