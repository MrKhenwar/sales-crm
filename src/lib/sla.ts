import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export const SLA_SETTING_KEY = "SLA_CONNECT_MINUTES";
const DEFAULT_SLA_MINUTES = 5;

export async function getSlaMinutes(): Promise<number> {
  const v = await getSetting(SLA_SETTING_KEY);
  const n = v ? parseInt(v, 10) : DEFAULT_SLA_MINUTES;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLA_MINUTES;
}

/**
 * Find every lead that was assigned >SLA min ago and has NOT been connected yet,
 * then emit a one-time SLA_BREACH-style notification to the assignee and to all
 * active managers. We dedupe via the Notification table's leadId+type+userId.
 */
export async function runSlaCheck(): Promise<{ checked: number; notified: number }> {
  const slaMin = await getSlaMinutes();
  const cutoff = new Date(Date.now() - slaMin * 60_000);
  // Don't fire SLA for ancient leads — only those whose deadline passed in the last hour.
  const floor = new Date(Date.now() - 60 * 60_000);

  const candidates = await prisma.lead.findMany({
    where: {
      createdAt: { lte: cutoff, gte: floor },
      assignedToUserId: { not: null },
      autoLabel: { not: "CONNECTED" },
      status: { in: ["NEW", "IN_PROGRESS"] },
    },
    select: { id: true, name: true, assignedToUserId: true, createdAt: true },
  });

  if (candidates.length === 0) return { checked: 0, notified: 0 };

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });
  const managerIds = managers.map((m) => m.id);

  let notified = 0;
  for (const lead of candidates) {
    const recipients = new Set<string>();
    if (lead.assignedToUserId) recipients.add(lead.assignedToUserId);
    for (const m of managerIds) recipients.add(m);

    for (const userId of recipients) {
      // Dedup: one SLA notification per (lead, user, type=REDIAL_DUE).
      const existing = await prisma.notification.findFirst({
        where: { userId, leadId: lead.id, type: "REDIAL_DUE" },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.notification.create({
        data: {
          userId,
          type: "REDIAL_DUE",
          leadId: lead.id,
          message: `SLA breach: lead "${lead.name}" hasn't been connected in ${slaMin} min`,
        },
      });
      notified++;
    }
  }
  return { checked: candidates.length, notified };
}
