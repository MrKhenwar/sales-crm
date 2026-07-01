import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AutoLabel, LeadSource, ManualLabel, Role } from "@/generated/prisma/enums";

export type LeadFilters = {
  q?: string;
  source?: LeadSource;
  autoLabel?: AutoLabel;
  manualLabel?: ManualLabel;
  assignedToUserId?: string;
  sort?: "newest" | "uncontacted" | "redial_due";
};

export async function listLeadsForUser(opts: {
  userId: string;
  role: Role;
  filters: LeadFilters;
  take?: number;
  skip?: number;
}) {
  const { userId, role, filters, take = 50, skip = 0 } = opts;

  const where: Prisma.LeadWhereInput = {};
  if (role !== "MANAGER") {
    where.assignedToUserId = userId;
  } else if (filters.assignedToUserId) {
    where.assignedToUserId = filters.assignedToUserId;
  }
  if (filters.source) where.source = filters.source;
  if (filters.autoLabel) where.autoLabel = filters.autoLabel;
  if (filters.manualLabel) where.labels = { some: { label: filters.manualLabel } };
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
  if (role !== "MANAGER" && lead.assignedToUserId !== userId) return null;
  return lead;
}

/** Lead funnel for the manager dashboard: status breakdown + contacted vs uncontacted. */
export async function leadFunnel() {
  const [byStatus, total, contacted] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { lastContactedAt: { not: null } } }),
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
