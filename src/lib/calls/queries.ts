import { prisma } from "@/lib/prisma";

/** Salesperson queue: uncontacted leads first, then redial-due. */
export async function nextLeadInQueue(userId: string) {
  // 1. Uncontacted (lastContactedAt is null), oldest first
  const uncontacted = await prisma.lead.findFirst({
    where: {
      assignedToUserId: userId,
      lastContactedAt: null,
      status: { in: ["NEW", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, phone: true, email: true, campaignName: true, autoLabel: true, source: true },
  });
  if (uncontacted) return uncontacted;

  // 2. Redial due (nextRedialAt <= now)
  const redial = await prisma.lead.findFirst({
    where: {
      assignedToUserId: userId,
      nextRedialAt: { lte: new Date() },
      status: { in: ["NEW", "IN_PROGRESS"] },
    },
    orderBy: { nextRedialAt: "asc" },
    select: { id: true, name: true, phone: true, email: true, campaignName: true, autoLabel: true, source: true },
  });
  return redial;
}

export async function getActiveSession(userId: string) {
  return prisma.callSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

export async function getActiveCallForUser(userId: string) {
  return prisma.call.findFirst({
    where: { userId, feedbackNote: null, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    include: {
      lead: { select: { id: true, name: true, phone: true } },
    },
  });
}

export async function getCallById(id: string) {
  return prisma.call.findUnique({
    where: { id },
    include: { lead: { select: { id: true, name: true, phone: true } } },
  });
}

export async function todayCallStats(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const calls = await prisma.call.findMany({
    where: { userId, startedAt: { gte: start } },
    select: { outcome: true, durationSec: true },
  });
  return {
    total: calls.length,
    connected: calls.filter((c) => c.outcome === "CONNECTED").length,
    notPicked: calls.filter((c) => c.outcome === "NO_ANSWER" || c.outcome === "BUSY" || c.outcome === "FAILED").length,
  };
}

/** Aggregated call stats for one lead (one phone number). */
export async function getCallStatsForLead(leadId: string) {
  const calls = await prisma.call.findMany({
    where: { leadId },
    select: { outcome: true, durationSec: true, startedAt: true },
  });
  const connectedCalls = calls.filter((c) => c.outcome === "CONNECTED");
  const totalDuration = calls.reduce((s, c) => s + (c.durationSec ?? 0), 0);
  const connectedDuration = connectedCalls.reduce((s, c) => s + (c.durationSec ?? 0), 0);
  return {
    total: calls.length,
    connected: connectedCalls.length,
    notPicked: calls.filter((c) => c.outcome === "NO_ANSWER" || c.outcome === "BUSY" || c.outcome === "FAILED").length,
    totalDurationSec: totalDuration,
    connectedDurationSec: connectedDuration,
    avgDurationSec: calls.length ? Math.round(totalDuration / calls.length) : 0,
    avgConnectedSec: connectedCalls.length ? Math.round(connectedDuration / connectedCalls.length) : 0,
    lastCalledAt: calls.length ? calls.reduce((a, c) => (c.startedAt > a ? c.startedAt : a), calls[0].startedAt) : null,
  };
}

import type { CallOutcome } from "@/generated/prisma/enums";
import type { Role } from "@/generated/prisma/enums";

export type CallLogFilters = {
  q?: string;
  outcome?: CallOutcome;
  agentUserId?: string;
  from?: Date;
  to?: Date;
};

/** List calls for a user with filters. Salesperson is auto-scoped to own calls. */
export async function listCallLogs(opts: {
  userId: string;
  role: Role;
  filters: CallLogFilters;
  take?: number;
  skip?: number;
}) {
  const { userId, role, filters, take = 100, skip = 0 } = opts;
  const where: import("@/generated/prisma/client").Prisma.CallWhereInput = {};
  if (role !== "MANAGER") {
    where.userId = userId;
  } else if (filters.agentUserId) {
    where.userId = filters.agentUserId;
  }
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.from || filters.to) {
    where.startedAt = {};
    if (filters.from) where.startedAt.gte = filters.from;
    if (filters.to) where.startedAt.lte = filters.to;
  }
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { leadPhone: { contains: q } },
      { agentPhone: { contains: q } },
      { fromNumber: { contains: q } },
      { lead: { name: { contains: q, mode: "insensitive" } } },
      { lead: { phone: { contains: q } } },
    ];
  }

  const [items, totals] = await Promise.all([
    prisma.call.findMany({
      where, orderBy: { startedAt: "desc" }, take, skip,
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.call.aggregate({
      where,
      _count: { _all: true },
      _sum: { durationSec: true },
      _avg: { durationSec: true },
    }),
  ]);
  return {
    items,
    total: totals._count._all,
    totalDurationSec: totals._sum.durationSec ?? 0,
    avgDurationSec: Math.round(totals._avg.durationSec ?? 0),
  };
}

/** Group calls by phone number — answers "how many times did we call N?" */
export async function listCallsByPhone(opts: {
  userId: string;
  role: Role;
  q?: string;
  take?: number;
}) {
  const { userId, role, q, take = 50 } = opts;
  const where: import("@/generated/prisma/client").Prisma.LeadWhereInput = {};
  if (role !== "MANAGER") where.assignedToUserId = userId;
  if (q) {
    const v = q.trim();
    where.OR = [
      { phone: { contains: v } },
      { name: { contains: v, mode: "insensitive" } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      assignedTo: { select: { name: true } },
      _count: { select: { calls: true } },
      calls: { select: { outcome: true, durationSec: true, startedAt: true } },
    },
    take,
  });
  return leads
    .filter((l) => l._count.calls > 0)
    .map((l) => {
      const totalDur = l.calls.reduce((s, c) => s + (c.durationSec ?? 0), 0);
      const connected = l.calls.filter((c) => c.outcome === "CONNECTED").length;
      const lastAt = l.calls.reduce((a, c) => (c.startedAt > a ? c.startedAt : a), l.calls[0].startedAt);
      return {
        leadId: l.id,
        name: l.name,
        phone: l.phone,
        assignee: l.assignedTo?.name ?? null,
        total: l._count.calls,
        connected,
        totalDurationSec: totalDur,
        avgDurationSec: l.calls.length ? Math.round(totalDur / l.calls.length) : 0,
        lastCalledAt: lastAt,
      };
    })
    .sort((a, b) => +b.lastCalledAt - +a.lastCalledAt);
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
