"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ManualLabel } from "@/generated/prisma/enums";

async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

const phoneRegex = /^\+\d{8,15}$/;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(phoneRegex, "Phone must be E.164 like +9198…"),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  campaignName: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  assignedToUserId: z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  campaignName: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
});

async function leadVisibleToUser(leadId: string, userId: string, role: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, assignedToUserId: true },
  });
  if (!lead) return null;
  if (role !== "MANAGER" && lead.assignedToUserId !== userId) return null;
  return lead;
}

function errParam(msg: string) {
  return `error=${encodeURIComponent(msg)}`;
}

export async function createLead(formData: FormData): Promise<void> {
  const user = await requireSession();

  const raw = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    campaignName: String(formData.get("campaignName") ?? ""),
    assignedToUserId: String(formData.get("assignedToUserId") ?? ""),
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) redirect(`/leads/new?${errParam(parsed.error.issues[0]?.message ?? "Invalid input")}`);

  const assignedToUserId =
    user.role === "MANAGER" ? parsed.data.assignedToUserId ?? null : user.id;

  const existing = await prisma.lead.findUnique({ where: { phone: parsed.data.phone }, select: { id: true } });
  if (existing) redirect(`/leads/new?${errParam("A lead with this phone already exists")}`);

  const lead = await prisma.lead.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      campaignName: parsed.data.campaignName,
      source: "MANUAL",
      assignedToUserId,
    },
    select: { id: true },
  });

  if (assignedToUserId) {
    await prisma.assignmentLog.create({
      data: {
        leadId: lead.id,
        fromUserId: null,
        toUserId: assignedToUserId,
        byUserId: user.id,
        reason: "Initial assignment",
      },
    });
  }

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(formData: FormData): Promise<void> {
  const user = await requireSession();
  const id = String(formData.get("id") ?? "");
  const parsed = updateSchema.safeParse({
    id,
    name: formData.get("name") ? String(formData.get("name")) : undefined,
    email: formData.get("email") !== null ? String(formData.get("email")) : undefined,
    campaignName: formData.get("campaignName") !== null ? String(formData.get("campaignName")) : undefined,
  });
  if (!parsed.success) redirect(`/leads/${id}?${errParam(parsed.error.issues[0]?.message ?? "Invalid input")}`);

  const lead = await leadVisibleToUser(parsed.data.id, user.id, user.role);
  if (!lead) redirect(`/leads?${errParam("Lead not found")}`);

  await prisma.lead.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email as string | null | undefined,
      campaignName: parsed.data.campaignName as string | null | undefined,
    },
  });
  revalidatePath(`/leads/${parsed.data.id}`);
  revalidatePath("/leads");
}

export async function assignLead(formData: FormData): Promise<void> {
  const user = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  if (user.role !== "MANAGER") redirect(`/leads/${leadId}?${errParam("Only managers can reassign")}`);

  const toUserId = String(formData.get("toUserId") ?? "");
  const reason = String(formData.get("reason") ?? "") || null;
  if (!leadId || !toUserId) redirect(`/leads/${leadId}?${errParam("Missing fields")}`);

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToUserId: true } });
  if (!lead) redirect(`/leads?${errParam("Lead not found")}`);
  const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, active: true } });
  if (!target || !target.active) redirect(`/leads/${leadId}?${errParam("Target user not active")}`);

  if (lead.assignedToUserId === toUserId) {
    revalidatePath(`/leads/${leadId}`);
    return;
  }

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { assignedToUserId: toUserId } }),
    prisma.assignmentLog.create({
      data: { leadId, fromUserId: lead.assignedToUserId, toUserId, byUserId: user.id, reason },
    }),
  ]);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function applyManualLabel(formData: FormData): Promise<void> {
  const user = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  const label = String(formData.get("label") ?? "") as ManualLabel;
  const allowed: ManualLabel[] = ["DISPATCH", "BOOKED", "ORDERED", "PAID"];
  if (!allowed.includes(label)) return;

  const lead = await leadVisibleToUser(leadId, user.id, user.role);
  if (!lead) return;

  await prisma.leadLabel.upsert({
    where: { leadId_label: { leadId, label } },
    update: { appliedBy: user.id, appliedAt: new Date() },
    create: { leadId, label, appliedBy: user.id },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function removeManualLabel(formData: FormData): Promise<void> {
  const user = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  const label = String(formData.get("label") ?? "") as ManualLabel;

  const lead = await leadVisibleToUser(leadId, user.id, user.role);
  if (!lead) return;

  await prisma.leadLabel.deleteMany({ where: { leadId, label } });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function deleteLead(formData: FormData): Promise<void> {
  const user = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  if (user.role !== "MANAGER") redirect(`/leads/${leadId}?${errParam("Only managers can delete")}`);
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/leads");
  redirect("/leads");
}

/** Add a free-text feedback note to a lead. Shown newest-first on the lead. */
export async function addLeadNote(formData: FormData): Promise<void> {
  const user = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId) redirect("/leads");
  if (!body) redirect(`/leads/${leadId}`);
  const lead = await leadVisibleToUser(leadId, user.id, user.role);
  if (!lead) redirect("/leads");
  await prisma.leadNote.create({
    data: { leadId, userId: user.id, body: body.slice(0, 2000) },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}
