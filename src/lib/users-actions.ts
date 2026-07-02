"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/scope";
import type { Role } from "@/generated/prisma/enums";

type Actor = { id: string; role: Role };

async function requireManagerOrAdmin(): Promise<Actor> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isManagerOrAdmin(session.user.role)) redirect("/");
  return { id: session.user.id, role: session.user.role };
}

/** Managers manage their team on /manager/team; admins use the full console. */
function panelPath(role: Role): string {
  return role === "MANAGER" ? "/manager/team" : "/manager/users";
}

const phoneOptional = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(8, "Password must be 8+ characters").max(128),
  role: z.enum(["SALESPERSON", "MANAGER", "ADMIN"]),
  phone: phoneOptional,
  managerId: z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["SALESPERSON", "MANAGER", "ADMIN"]),
  phone: phoneOptional,
  managerId: z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

const resetPwSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8, "Password must be 8+ characters").max(128),
});

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Ensure a managerId (if given) actually points to a manager, else null. */
async function normalizeManagerId(managerId: string | null): Promise<string | null> {
  if (!managerId) return null;
  const m = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
  return m && m.role === "MANAGER" ? managerId : null;
}

/**
 * Verify the actor may act on `targetId`. Admins may touch anyone; managers only
 * active salespeople on their own team. Returns the target's basics.
 */
async function assertManageable(actor: Actor, targetId: string) {
  const t = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, managerId: true, active: true, email: true },
  });
  if (!t) err(panelPath(actor.role), "User not found");
  if (actor.role === "MANAGER" && (t!.role !== "SALESPERSON" || t!.managerId !== actor.id)) {
    err(panelPath(actor.role), "That user isn't on your team");
  }
  return t!;
}

export async function createUserAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? "SALESPERSON"),
    phone: String(formData.get("phone") ?? ""),
    managerId: String(formData.get("managerId") ?? ""),
  });
  if (!parsed.success) err(panelPath(me.role), parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  // Managers can only create salespeople, auto-placed on their own team.
  let role: Role = data.role;
  let managerId: string | null = data.managerId;
  if (me.role === "MANAGER") {
    role = "SALESPERSON";
    managerId = me.id;
  } else {
    // Admin: managerId only meaningful for a salesperson, and must be a real manager.
    managerId = role === "SALESPERSON" ? await normalizeManagerId(managerId) : null;
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) err(panelPath(me.role), "A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role,
      phone: data.phone,
      managerId,
      active: true,
    },
  });

  revalidatePath(panelPath(me.role));
  // Show the password back once so it can be copied.
  redirect(`${panelPath(me.role)}?created=${encodeURIComponent(data.email)}&password=${encodeURIComponent(data.password)}`);
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  const parsed = updateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "SALESPERSON"),
    phone: String(formData.get("phone") ?? ""),
    managerId: String(formData.get("managerId") ?? ""),
  });
  if (!parsed.success) err(panelPath(me.role), parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  const target = await assertManageable(me, data.id);

  // Managers can only rename/retouch their own salespeople — never change role or team.
  let role: Role = data.role;
  let managerId: string | null = data.managerId;
  if (me.role === "MANAGER") {
    role = "SALESPERSON";
    managerId = me.id;
  } else {
    // Admin safety: can't demote the last active admin.
    if (target.role === "ADMIN" && data.role !== "ADMIN") {
      const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: data.id } } });
      if (otherAdmins === 0) err(panelPath(me.role), "Can't demote the last admin");
    }
    managerId = role === "SALESPERSON" ? await normalizeManagerId(managerId) : null;
  }

  // Don't allow renaming an email to one already used by someone else.
  const collision = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (collision && collision.id !== data.id) err(panelPath(me.role), "Email is already used by another user");

  await prisma.user.update({
    where: { id: data.id },
    data: { name: data.name, email: data.email, role, phone: data.phone, managerId },
  });
  revalidatePath(panelPath(me.role));
  redirect(`${panelPath(me.role)}?saved=1`);
}

export async function resetUserPasswordAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  const parsed = resetPwSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) err(panelPath(me.role), parsed.error.issues[0]?.message ?? "Invalid input");

  const target = await assertManageable(me, parsed.data.id);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: parsed.data.id }, data: { passwordHash } });
  revalidatePath(panelPath(me.role));
  redirect(`${panelPath(me.role)}?reset=${encodeURIComponent(target.email)}&password=${encodeURIComponent(parsed.data.password)}`);
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) err(panelPath(me.role), "Missing user");
  if (id === me.id) err(panelPath(me.role), "You can't disable yourself");

  const target = await assertManageable(me, id);

  // Safety: cannot disable the last active admin.
  if (target.active && target.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
    if (otherAdmins === 0) err(panelPath(me.role), "Can't disable the last admin");
  }

  await prisma.user.update({ where: { id }, data: { active: !target.active } });
  revalidatePath(panelPath(me.role));
  redirect(`${panelPath(me.role)}?saved=1`);
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function generatePasswordAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) err(panelPath(me.role), "Missing user");

  const target = await assertManageable(me, id);

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  revalidatePath(panelPath(me.role));
  redirect(`${panelPath(me.role)}?reset=${encodeURIComponent(target.email)}&password=${encodeURIComponent(password)}`);
}

/**
 * Manager self-pick: add a salesperson to my team. Only unassigned salespeople
 * (or ones already mine) may be picked — this prevents poaching another
 * manager's salesperson.
 */
export async function addToMyTeamAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  if (me.role !== "MANAGER") err(panelPath(me.role), "Only managers pick their own team");
  const id = String(formData.get("id") ?? "");
  if (!id) err("/manager/team", "Missing salesperson");

  const t = await prisma.user.findUnique({ where: { id }, select: { role: true, managerId: true, active: true } });
  if (!t || t.role !== "SALESPERSON" || !t.active) err("/manager/team", "That user can't be added");
  if (t!.managerId && t!.managerId !== me.id) err("/manager/team", "That salesperson is already on another team");

  await prisma.user.update({ where: { id }, data: { managerId: me.id } });
  revalidatePath("/manager/team");
  redirect("/manager/team?saved=1");
}

/** Manager: release a salesperson from my team (back to the unassigned pool). */
export async function removeFromMyTeamAction(formData: FormData): Promise<void> {
  const me = await requireManagerOrAdmin();
  if (me.role !== "MANAGER") err(panelPath(me.role), "Only managers pick their own team");
  const id = String(formData.get("id") ?? "");
  if (!id) err("/manager/team", "Missing salesperson");

  const t = await prisma.user.findUnique({ where: { id }, select: { managerId: true } });
  if (!t || t.managerId !== me.id) err("/manager/team", "That salesperson isn't on your team");

  await prisma.user.update({ where: { id }, data: { managerId: null } });
  revalidatePath("/manager/team");
  redirect("/manager/team?saved=1");
}
