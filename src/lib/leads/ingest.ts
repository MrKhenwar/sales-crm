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

export function normalizePhone(raw: string): string | null {
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
 * Round-robin across ALL active salespeople — leads are auto-distributed to
 * everybody as they arrive, no manual assignment needed. Managers see the ones
 * that land on their team and can reshuffle. Returns null only when there are no
 * active salespeople at all.
 */
async function pickRoundRobinAssignee(): Promise<string | null> {
  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (salespeople.length === 0) return null;
  const cursor = await bumpCursor("__ALL__");
  return salespeople[(cursor - 1) % salespeople.length].id;
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

/**
 * Assign `count` leads across ALL active salespeople in a flat round-robin,
 * computed in memory so a whole sheet is distributed with a couple of queries
 * instead of one per row. The cursor is loaded once and persisted once so
 * rotation stays continuous across syncs. Returns an array of assignee ids (or
 * nulls when there are no active salespeople) of length `count`.
 */
async function assignRoundRobinBatch(count: number): Promise<(string | null)[]> {
  if (count <= 0) return [];
  const mode = await getAutoAssignMode();
  if (mode !== "round_robin") return new Array(count).fill(null);

  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (salespeople.length === 0) return new Array(count).fill(null);

  const row = await prisma.roundRobinCursor.findUnique({ where: { key: "__ALL__" } });
  let cursor = row?.cursor ?? 0;
  const out: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    cursor++;
    out.push(salespeople[(cursor - 1) % salespeople.length].id);
  }
  await prisma.roundRobinCursor.upsert({
    where: { key: "__ALL__" },
    update: { cursor },
    create: { key: "__ALL__", cursor },
  });
  return out;
}

export type BulkLeadInput = {
  name: string;
  phone: string;
  email?: string | null;
  campaignName?: string | null;
  source: LeadSource;
  adFormData?: Record<string, unknown> | null;
};

export type BulkLeadResult = {
  created: number;
  duplicates: number;
  skipped: number;
  /** phone(E.164) → leadId for every row that resolved to a lead (new or existing). */
  byPhone: Map<string, string>;
};

/**
 * Fast path for importing many rows (sheet sync / CSV). Dedups by phone in a
 * single query, round-robins new leads in memory, and writes with createMany —
 * a handful of queries total instead of ~5 per row. Existing leads with no
 * captured form data get a one-time adFormData backfill so their details show up.
 */
export async function bulkIngestLeads(inputs: BulkLeadInput[]): Promise<BulkLeadResult> {
  const result: BulkLeadResult = { created: 0, duplicates: 0, skipped: 0, byPhone: new Map() };

  // Normalize + drop invalid, keeping the first row per phone.
  const byPhone = new Map<string, BulkLeadInput>();
  for (const raw of inputs) {
    const phone = normalizePhone(raw.phone);
    const name = (raw.name ?? "").trim();
    if (!phone || !name) { result.skipped++; continue; }
    if (!byPhone.has(phone)) byPhone.set(phone, { ...raw, phone, name });
  }
  const phones = Array.from(byPhone.keys());
  if (phones.length === 0) return result;

  // One query: which phones already exist?
  const existing = await prisma.lead.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, adFormData: true, assignedToUserId: true },
  });
  const existingByPhone = new Map(existing.map((e) => [e.phone, e]));
  for (const e of existing) result.byPhone.set(e.phone, e.id);

  const newPhones = phones.filter((p) => !existingByPhone.has(p));
  // Leads already in the DB but still sitting in the unassigned pool — hand them
  // out too, so a sync clears the backlog automatically (no manual assign).
  const unassignedExisting = existing.filter((e) => e.assignedToUserId === null);

  // One round-robin pass covers both new leads and the unassigned backlog, so the
  // whole batch is spread evenly across everybody in a single continuous rotation.
  const assignees = await assignRoundRobinBatch(newPhones.length + unassignedExisting.length);
  const newAssignees = assignees.slice(0, newPhones.length);
  const backlogAssignees = assignees.slice(newPhones.length);

  if (newPhones.length > 0) {
    await prisma.lead.createMany({
      data: newPhones.map((phone, i) => {
        const row = byPhone.get(phone)!;
        return {
          name: row.name,
          phone,
          email: row.email || null,
          source: row.source,
          campaignName: row.campaignName || null,
          adFormData: (row.adFormData ?? undefined) as object | undefined,
          assignedToUserId: newAssignees[i] ?? null,
        };
      }),
      skipDuplicates: true,
    });

    // Fetch the ids of everything we just created, then fan out notifications.
    const created = await prisma.lead.findMany({
      where: { phone: { in: newPhones } },
      select: { id: true, phone: true, name: true, assignedToUserId: true },
    });
    result.created += created.length;
    for (const c of created) result.byPhone.set(c.phone, c.id);

    // Notify each assignee. (No AssignmentLog here — sheet ingest has no acting
    // user, and AssignmentLog.byUserId is required.)
    const assigned = created.filter((c) => c.assignedToUserId);
    if (assigned.length > 0) {
      await prisma.notification.createMany({
        data: assigned.map((c) => ({
          userId: c.assignedToUserId as string,
          type: "NEW_LEAD" as const,
          leadId: c.id,
          message: `New lead assigned: ${c.name}`,
        })),
      });
    }
  }

  // Assign the pre-existing unassigned backlog: group by target and issue one
  // updateMany per salesperson (a handful of statements even for a big backlog).
  const backlogMoves = unassignedExisting
    .map((e, i) => ({ leadId: e.id, to: backlogAssignees[i] }))
    .filter((m): m is { leadId: string; to: string } => Boolean(m.to));
  if (backlogMoves.length > 0) {
    const idsByTarget = new Map<string, string[]>();
    for (const m of backlogMoves) {
      const list = idsByTarget.get(m.to) ?? [];
      list.push(m.leadId);
      idsByTarget.set(m.to, list);
    }
    await prisma.$transaction([
      ...Array.from(idsByTarget.entries()).map(([to, ids]) =>
        prisma.lead.updateMany({ where: { id: { in: ids } }, data: { assignedToUserId: to } }),
      ),
      prisma.notification.createMany({
        data: backlogMoves.map((m) => ({
          userId: m.to,
          type: "NEW_LEAD" as const,
          leadId: m.leadId,
          message: "A lead was assigned to you",
        })),
      }),
    ]);
  }

  // Existing duplicates.
  result.duplicates += phones.length - newPhones.length;

  // One-time backfill: give already-imported leads their captured details.
  // Done as a single set-based UPDATE ... FROM (VALUES …) per chunk so a big
  // first sync is a couple of queries instead of thousands of round-trips.
  const toBackfill = existing.filter((e) => e.adFormData == null && byPhone.get(e.phone)?.adFormData);
  for (let i = 0; i < toBackfill.length; i += 500) {
    const chunk = toBackfill.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = chunk.map((e, j) => {
      params.push(e.id, JSON.stringify(byPhone.get(e.phone)!.adFormData));
      return `($${j * 2 + 1}::text, $${j * 2 + 2}::jsonb)`;
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "Lead" AS l SET "adFormData" = v.data
       FROM (VALUES ${tuples.join(",")}) AS v(id, data)
       WHERE l.id = v.id`,
      ...params,
    );
  }

  return result;
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
