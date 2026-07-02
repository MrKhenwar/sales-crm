import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

/**
 * Team-based data visibility. The org is a tree:
 *   ADMIN  — the head; sees everything (all managers, salespeople, leads, calls).
 *   MANAGER — sees only their own team (salespeople where managerId = manager.id).
 *   SALESPERSON — sees only their own leads/calls.
 *
 * A salesperson belongs to exactly one manager (User.managerId). Unassigned
 * salespeople (managerId = null) and unassigned leads are visible to ADMIN only.
 */
export type Viewer = { id: string; role: Role };

/** Managers and the admin can manage leads, teams, and see dashboards. */
export function isManagerOrAdmin(role: Role): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

/**
 * The set of user IDs whose leads/calls/data this viewer may see.
 * Returns `null` for ADMIN — meaning "no restriction, see everything".
 *
 * Usage in a Prisma `where`:
 *   const ids = await visibleUserIds(viewer);
 *   if (ids) where.assignedToUserId = { in: ids };  // omit filter when null
 */
export async function visibleUserIds(v: Viewer): Promise<string[] | null> {
  if (v.role === "ADMIN") return null;
  if (v.role === "MANAGER") {
    const team = await prisma.user.findMany({
      where: { managerId: v.id },
      select: { id: true },
    });
    return [v.id, ...team.map((t) => t.id)];
  }
  return [v.id];
}

/**
 * Salespeople this viewer may assign leads to / that appear in assignee dropdowns.
 *   ADMIN   — every active salesperson.
 *   MANAGER — active salespeople on their own team.
 *   other   — none.
 */
export async function listAssignableSalespeople(v: Viewer) {
  if (v.role === "ADMIN") {
    return prisma.user.findMany({
      where: { role: "SALESPERSON", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
  if (v.role === "MANAGER") {
    return prisma.user.findMany({
      where: { role: "SALESPERSON", active: true, managerId: v.id },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
  return [];
}

/**
 * Salespeople a manager may ADD to their team: those not yet owned by anyone,
 * plus (harmlessly) their own current members. Prevents poaching another
 * manager's salesperson.
 */
export async function listPickableSalespeople(managerId: string) {
  return prisma.user.findMany({
    where: {
      role: "SALESPERSON",
      active: true,
      OR: [{ managerId: null }, { managerId }],
    },
    select: { id: true, name: true, email: true, managerId: true },
    orderBy: { name: "asc" },
  });
}

/** True if `targetUserId` is assignable by this viewer (own team, or anyone for admin). */
export async function canAssignTo(v: Viewer, targetUserId: string): Promise<boolean> {
  if (v.role === "ADMIN") {
    const u = await prisma.user.findUnique({ where: { id: targetUserId }, select: { active: true } });
    return !!u?.active;
  }
  if (v.role === "MANAGER") {
    const u = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { active: true, managerId: true },
    });
    return !!u?.active && u.managerId === v.id;
  }
  return false;
}
