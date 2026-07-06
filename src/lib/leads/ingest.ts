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

/**
 * Assign `count` new leads across the teams' salespeople using the same two-level
 * per-team round-robin as {@link pickRoundRobinAssignee}, but computed in memory
 * so a whole sheet is distributed with a couple of queries instead of one per row.
 * Cursor state is loaded once and persisted once so rotation stays continuous
 * across syncs. Returns an array of assignee ids (or nulls) of length `count`.
 */
async function assignRoundRobinBatch(count: number): Promise<(string | null)[]> {
  if (count <= 0) return [];
  const mode = await getAutoAssignMode();
  if (mode !== "round_robin") return new Array(count).fill(null);

  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true, managerId: { not: null } },
    select: { id: true, managerId: true },
    orderBy: { createdAt: "asc" },
  });
  if (salespeople.length === 0) return new Array(count).fill(null);

  const teams = new Map<string, string[]>();
  for (const sp of salespeople) {
    const mid = sp.managerId as string;
    const list = teams.get(mid) ?? [];
    list.push(sp.id);
    teams.set(mid, list);
  }
  const teamIds = Array.from(teams.keys()).sort();

  // Load current cursors for the team-level key + every team key in one query.
  const keys = ["__TEAMS__", ...teamIds];
  const rows = await prisma.roundRobinCursor.findMany({ where: { key: { in: keys } } });
  const cursor = new Map<string, number>(rows.map((r) => [r.key, r.cursor]));
  const get = (k: string) => cursor.get(k) ?? 0;

  const out: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const t = get("__TEAMS__") + 1;
    cursor.set("__TEAMS__", t);
    const managerId = teamIds[(t - 1) % teamIds.length];
    const members = teams.get(managerId)!;
    const m = get(managerId) + 1;
    cursor.set(managerId, m);
    out.push(members[(m - 1) % members.length]);
  }

  // Persist the advanced cursors once.
  await Promise.all(
    keys.map((k) =>
      prisma.roundRobinCursor.upsert({
        where: { key: k },
        update: { cursor: get(k) },
        create: { key: k, cursor: get(k) },
      }),
    ),
  );
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
    select: { id: true, phone: true, adFormData: true },
  });
  const existingByPhone = new Map(existing.map((e) => [e.phone, e]));
  for (const e of existing) result.byPhone.set(e.phone, e.id);

  const newPhones = phones.filter((p) => !existingByPhone.has(p));
  const assignees = await assignRoundRobinBatch(newPhones.length);

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
          assignedToUserId: assignees[i] ?? null,
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

  // Existing duplicates.
  result.duplicates += phones.length - newPhones.length;

  // One-time backfill: give already-imported leads their captured details.
  // Chunked so a big first sync doesn't exhaust the DB connection pool.
  const toBackfill = existing.filter((e) => e.adFormData == null && byPhone.get(e.phone)?.adFormData);
  for (let i = 0; i < toBackfill.length; i += 25) {
    await Promise.all(
      toBackfill.slice(i, i + 25).map((e) =>
        prisma.lead.update({
          where: { id: e.id },
          data: { adFormData: byPhone.get(e.phone)!.adFormData as object },
        }),
      ),
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
