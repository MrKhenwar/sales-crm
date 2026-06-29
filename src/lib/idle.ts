import { prisma } from "@/lib/prisma";

export const IDLE_HOURS = 5;

/**
 * Alert when an active salesperson with leads waiting hasn't logged a call in
 * IDLE_HOURS — notifies the salesperson AND every active manager. Deduped to at
 * most one alert per salesperson per IDLE_HOURS window (gated on the
 * salesperson's own "No calls" notification, which also gates the manager copies).
 *
 * Pass { userId } to check just one salesperson (used on the hot ingest path);
 * omit it to sweep everyone (scheduler / cron).
 */
export async function runIdleAgentCheck(opts: { userId?: string } = {}): Promise<{ idle: number; notified: number }> {
  const cutoff = new Date(Date.now() - IDLE_HOURS * 3600_000);

  const salespeople = await prisma.user.findMany({
    where: { role: "SALESPERSON", active: true, ...(opts.userId ? { id: opts.userId } : {}) },
    select: { id: true, name: true },
  });
  if (salespeople.length === 0) return { idle: 0, notified: 0 };

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });
  const managerIds = managers.map((m) => m.id);

  let idle = 0;
  let notified = 0;

  for (const sp of salespeople) {
    // Only nag when there's actually work waiting.
    const activeLeads = await prisma.lead.count({
      where: { assignedToUserId: sp.id, status: { in: ["NEW", "IN_PROGRESS"] } },
    });
    if (activeLeads === 0) continue;

    const lastCall = await prisma.call.findFirst({
      where: { userId: sp.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (lastCall?.startedAt && lastCall.startedAt > cutoff) continue; // called recently

    // Dedup: one idle alert per salesperson per window.
    const recent = await prisma.notification.findFirst({
      where: {
        userId: sp.id,
        type: "REDIAL_DUE",
        leadId: null,
        createdAt: { gte: cutoff },
        message: { startsWith: "No calls" },
      },
      select: { id: true },
    });
    if (recent) continue;

    idle++;
    const spMsg = `No calls logged in over ${IDLE_HOURS} hours. ${activeLeads} lead(s) waiting — please start calling.`;
    const mgrMsg = `${sp.name} hasn't logged a call in over ${IDLE_HOURS} hours (${activeLeads} lead(s) waiting).`;

    await prisma.notification.create({
      data: { userId: sp.id, type: "REDIAL_DUE", leadId: null, message: spMsg },
    });
    notified++;
    for (const mid of managerIds) {
      await prisma.notification.create({
        data: { userId: mid, type: "REDIAL_DUE", leadId: null, message: mgrMsg },
      });
      notified++;
    }
  }

  return { idle, notified };
}
