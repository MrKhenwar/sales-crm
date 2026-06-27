"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

async function requireManager() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "MANAGER") redirect("/");
  return session.user;
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
  role: z.enum(["SALESPERSON", "MANAGER"]),
  phone: phoneOptional,
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["SALESPERSON", "MANAGER"]),
  phone: phoneOptional,
});

const resetPwSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8, "Password must be 8+ characters").max(128),
});

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? "SALESPERSON"),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!parsed.success) err("/manager/users", parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) err("/manager/users", "A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      phone: data.phone,
      active: true,
    },
  });

  revalidatePath("/manager/users");
  // Show the password back once so the manager can copy it.
  redirect(`/manager/users?created=${encodeURIComponent(data.email)}&password=${encodeURIComponent(data.password)}`);
  // unreachable: keeps `me` referenced
  void me;
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const parsed = updateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "SALESPERSON"),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!parsed.success) err("/manager/users", parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: data.id }, select: { id: true, role: true } });
  if (!target) err("/manager/users", "User not found");

  // Safety: cannot demote the last active manager.
  if (target!.role === "MANAGER" && data.role !== "MANAGER") {
    const otherActiveManagers = await prisma.user.count({
      where: { role: "MANAGER", active: true, id: { not: data.id } },
    });
    if (otherActiveManagers === 0) err("/manager/users", "Can't demote the last manager");
  }

  // Don't allow renaming an email to one already used by someone else.
  if (data.email) {
    const collision = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (collision && collision.id !== data.id) err("/manager/users", "Email is already used by another user");
  }

  await prisma.user.update({
    where: { id: data.id },
    data: { name: data.name, email: data.email, role: data.role, phone: data.phone },
  });
  revalidatePath("/manager/users");
  redirect("/manager/users?saved=1");
  void me;
}

export async function resetUserPasswordAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const parsed = resetPwSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) err("/manager/users", parsed.error.issues[0]?.message ?? "Invalid input");

  const target = await prisma.user.findUnique({ where: { id: parsed.data.id }, select: { email: true } });
  if (!target) err("/manager/users", "User not found");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: parsed.data.id }, data: { passwordHash } });
  revalidatePath("/manager/users");
  redirect(`/manager/users?reset=${encodeURIComponent(target!.email)}&password=${encodeURIComponent(parsed.data.password)}`);
  void me;
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) err("/manager/users", "Missing user");
  if (id === me.id) err("/manager/users", "You can't disable yourself");

  const target = await prisma.user.findUnique({ where: { id }, select: { active: true, role: true } });
  if (!target) err("/manager/users", "User not found");

  // Safety: cannot disable the last active manager.
  if (target!.active && target!.role === "MANAGER") {
    const otherActiveManagers = await prisma.user.count({
      where: { role: "MANAGER", active: true, id: { not: id } },
    });
    if (otherActiveManagers === 0) err("/manager/users", "Can't disable the last manager");
  }

  await prisma.user.update({ where: { id }, data: { active: !target!.active } });
  revalidatePath("/manager/users");
  redirect("/manager/users?saved=1");
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  // ensure at least 1 digit + 1 letter (the chars set already mixes case+digits)
  return out;
}

export async function generatePasswordAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) err("/manager/users", "Missing user");

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) err("/manager/users", "User not found");

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  revalidatePath("/manager/users");
  redirect(`/manager/users?reset=${encodeURIComponent(target!.email)}&password=${encodeURIComponent(password)}`);
  void me;
}
