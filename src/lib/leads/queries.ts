import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AutoLabel, LeadSource, LeadStatus, ManualLabel, Role } from "@/generated/prisma/enums";
import { visibleUserIds } from "@/lib/scope";

export type LeadFilters = {
  q?: string;
  source?: LeadSource;
  status?: LeadStatus;
  // "Active" = not yet won/lost (status NEW or IN_PROGRESS).
  activeOnly?: boolean;
  autoLabel?: AutoLabel;
  manualLabel?: ManualLabel;
  campaign?: string;
  assignedToUserId?: string;
  // Filter by Lead.createdAt (date-wise views).
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "newest" | "uncontacted" | "redial_due";
};

export type DatePreset = "today" | "yesterday" | "week" | "month" | "year";

/**
 * Resolve a named date preset to a [from, to] range on the local day boundaries.
 * "week"/"month"/"year" are the current calendar week (Mon-start)/month/year.
 */
export function resolveDatePreset(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "yesterday") {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === "week") {
    const d = new Date(now);
    const day = d.getDay();
    const offset = day === 0 ? 6 : day - 1; // Monday as week start
    d.setDate(d.getDate() - offset);
    return { from: startOfDay(d), to: endOfDay(now) };
  }
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(first), to: endOfDay(now) };
  }
  // year
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return { from: startOfDay(jan1), to: endOfDay(now) };
}

export async function listLeadsForUser(opts: {
  userId: string;
  role: Role;
  filters: LeadFilters;
  take?: number;
  skip?: number;
}) {
  const { userId, role, filters, take = 50, skip = 0 } = opts;

  const where: Prisma.LeadWhereInput = {};
  // Scope to the viewer's team. ADMIN (visibleIds === null) sees everything,
  // including the unassigned pool. Managers/salespeople are limited to their ids.
  const visibleIds = await visibleUserIds({ id: userId, role });
  if (visibleIds) {
    if (filters.assignedToUserId && visibleIds.includes(filters.assignedToUserId)) {
      where.assignedToUserId = filters.assignedToUserId;
    } else {
      where.assignedToUserId = { in: visibleIds };
    }
  } else if (filters.assignedToUserId) {
    where.assignedToUserId = filters.assignedToUserId;
  }
  if (filters.source) where.source = filters.source;
  if (filters.activeOnly) where.status = { in: ["NEW", "IN_PROGRESS"] };
  else if (filters.status) where.status = filters.status;
  if (filters.autoLabel) where.autoLabel = filters.autoLabel;
  if (filters.manualLabel) where.labels = { some: { label: filters.manualLabel } };
  if (filters.campaign) where.campaignName = filters.campaign;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
    if (filters.dateTo) where.createdAt.lte = filters.dateTo;
  }
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  // Default: leads that still need a call float to the top; leads already
  // called (lastContactedAt set) sink to the bottom.
  let orderBy: Prisma.LeadOrderByWithRelationInput | Prisma.LeadOrderByWithRelationInput[] = [
    { lastContactedAt: { sort: "asc", nulls: "first" } },
    { createdAt: "desc" },
  ];
  if (filters.sort === "newest") {
    orderBy = { createdAt: "desc" };
  } else if (filters.sort === "redial_due") {
    orderBy = [{ nextRedialAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      take,
      skip,
      // Load all relations in one SQL round-trip instead of several — ~10x faster.
      relationLoadStrategy: "join",
      include: {
        labels: { select: { label: true } },
        assignedTo: { select: { id: true, name: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return { items, total };
}

export async function getLeadById(opts: { id: string; userId: string; role: Role }) {
  const { id, userId, role } = opts;
  const lead = await prisma.lead.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: {
      labels: { select: { label: true, appliedAt: true, appliedBy: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } } },
      },
      assignmentLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          fromUser: { select: { name: true } },
          toUser: { select: { name: true } },
          by: { select: { name: true } },
        },
      },
    },
  });
  if (!lead) return null;
  const visibleIds = await visibleUserIds({ id: userId, role });
  // ADMIN (null) sees any lead; others only leads assigned within their scope.
  if (visibleIds && (lead.assignedToUserId === null || !visibleIds.includes(lead.assignedToUserId))) {
    return null;
  }
  return lead;
}

/**
 * Lead funnel for the manager dashboard: status breakdown + contacted vs uncontacted.
 * Pass `visibleIds` to scope to a manager's team; omit (or null) for the whole org (admin).
 */
export async function leadFunnel(visibleIds?: string[] | null) {
  const scope: Prisma.LeadWhereInput = visibleIds ? { assignedToUserId: { in: visibleIds } } : {};
  const [byStatus, total, contacted] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.lead.count({ where: scope }),
    prisma.lead.count({ where: { ...scope, lastContactedAt: { not: null } } }),
  ]);
  const m = new Map(byStatus.map((s) => [s.status, s._count._all]));
  return {
    total,
    contacted,
    uncontacted: total - contacted,
    new: m.get("NEW") ?? 0,
    inProgress: m.get("IN_PROGRESS") ?? 0,
    won: m.get("WON") ?? 0,
    lost: m.get("LOST") ?? 0,
  };
}

export async function listActiveSalespeople() {
  return prisma.user.findMany({
    where: { role: "SALESPERSON", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Distinct campaigns (by Lead.campaignName) in the viewer's scope, with counts. */
export async function listCampaigns(opts: { userId: string; role: Role }) {
  const visibleIds = await visibleUserIds({ id: opts.userId, role: opts.role });
  const where: Prisma.LeadWhereInput = { campaignName: { not: null } };
  if (visibleIds) where.assignedToUserId = { in: visibleIds };
  const rows = await prisma.lead.groupBy({
    by: ["campaignName"],
    where,
    _count: { _all: true },
  });
  return rows
    .filter((r) => r.campaignName && r.campaignName.trim() !== "")
    .map((r) => ({ name: r.campaignName as string, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}
