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

  let orderBy: Prisma.LeadOrderByWithRelationInput | Prisma.LeadOrderByWithRelationInput[] = { createdAt: "desc" };
  if (filters.sort === "uncontacted") {
    orderBy = [{ lastContactedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }];
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

export async function listActiveSalespeople() {
  return prisma.user.findMany({
    where: { role: "SALESPERSON", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
