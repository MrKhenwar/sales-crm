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

/** Atomically bump a named round-robin cursor and return its new value. */
async function bumpCursor(key: string): Promise<number> {
  const row = await prisma.roundRobinCursor.upsert({
    where: { key },
    update: { cursor: { increment: 1 } },
    create: { key, cursor: 1 },
  });
  return row.cursor;
}

/**
 * Per-team round-robin. New leads rotate across teams (managers who own at least
 * one active salesperson), and within the chosen team rotate across that team's
 * active salespeople. Salespeople with no manager are excluded — a lead assigned
 * to them would be invisible to every manager. Returns null when no eligible
 * team/salesperson exists (the lead stays in the admin-only unassigned pool).
 */
async function pickRoundRobinAssignee(): Promise<string | null> {
  // Active salespeople who belong to a manager, grouped into teams.
  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true, managerId: { not: null } },
    select: { id: true, managerId: true },
    orderBy: { createdAt: "asc" },
  });
  if (salespeople.length === 0) return null;

  // Group by managerId, preserving a stable (createdAt) order within each team.
  const teams = new Map<string, string[]>();
  for (const sp of salespeople) {
    const mid = sp.managerId as string;
    const list = teams.get(mid) ?? [];
    list.push(sp.id);
    teams.set(mid, list);
  }
  const teamIds = Array.from(teams.keys()).sort(); // stable ordering across calls

  // Level 1: pick the next team.
  const teamCursor = await bumpCursor("__TEAMS__");
  const managerId = teamIds[(teamCursor - 1) % teamIds.length];

  // Level 2: pick the next salesperson within that team.
  const members = teams.get(managerId)!;
  const memberCursor = await bumpCursor(managerId);
  return members[(memberCursor - 1) % members.length];
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
