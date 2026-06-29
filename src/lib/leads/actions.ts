"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AutoLabel, ManualLabel } from "@/generated/prisma/enums";

async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

// Every manual label a salesperson/manager can toggle on a lead.
const ALL_MANUAL_LABELS: ManualLabel[] = [
  "DISPATCH", "BOOKED", "ORDERED", "PAID", "INTERESTED", "NOT_INTERESTED",
  "CALL_LATER", "BUSY", "CALL_CUT", "WRONG_NUMBER", "BLOCKED", "OFFLINE",
  "MALE", "HINDI", "OTHER_LANGUAGE", "WHATSAPP_SHARED",
];
const AUTO_LABELS: AutoLabel[] = ["NONE", "NOT_PICKED", "CONNECTED", "REDIAL"];

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
  if (!ALL_MANUAL_LABELS.includes(label)) return;

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

/**
 * Shared writer: assign a set of leads to a list of salespeople, evenly and
 * randomly. Writes the Lead row, an AssignmentLog, and a NEW_LEAD notification
 * per lead, all in one transaction. Returns how many were moved.
 */
async function distributeLeads(opts: {
  leads: { id: string; assignedToUserId: string | null }[];
  salespeople: { id: string }[];
  byUserId: string;
  reason: string;
}): Promise<number> {
  const { byUserId, reason, salespeople } = opts;
  if (salespeople.length === 0 || opts.leads.length === 0) return 0;

  // Shuffle (Fisher–Yates) so distribution is random, then round-robin across people.
  const leads = [...opts.leads];
  for (let i = leads.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [leads[i], leads[j]] = [leads[j], leads[i]];
  }

  const moves = leads
    .map((lead, i) => ({ leadId: lead.id, to: salespeople[i % salespeople.length].id }))
    // Skip leads already on the target person — nothing to do.
    .filter((m, i) => leads[i].assignedToUserId !== m.to);

  if (moves.length === 0) return 0;

  await prisma.$transaction([
    ...moves.map((m) =>
      prisma.lead.update({ where: { id: m.leadId }, data: { assignedToUserId: m.to } }),
    ),
    prisma.assignmentLog.createMany({
      data: moves.map((m) => ({ leadId: m.leadId, toUserId: m.to, byUserId, reason })),
    }),
    prisma.notification.createMany({
      data: moves.map((m) => ({
        userId: m.to,
        type: "NEW_LEAD" as const,
        leadId: m.leadId,
        message: "A lead was assigned to you",
      })),
    }),
  ]);
  return moves.length;
}

/** Manager: randomly split every currently-unassigned lead across active salespeople. */
export async function assignAllUnassigned(): Promise<void> {
  const user = await requireSession();
  if (user.role !== "MANAGER") redirect(`/leads?${errParam("Only managers can assign leads")}`);

  const [salespeople, leads] = await Promise.all([
    prisma.user.findMany({ where: { role: "SALESPERSON", active: true }, select: { id: true } }),
    prisma.lead.findMany({ where: { assignedToUserId: null }, select: { id: true, assignedToUserId: true } }),
  ]);

  if (salespeople.length === 0) redirect(`/leads?${errParam("No active salespeople to assign to")}`);
  if (leads.length === 0) redirect(`/leads?${errParam("No unassigned leads to distribute")}`);

  const moved = await distributeLeads({ leads, salespeople, byUserId: user.id, reason: "Bulk assign (random)" });
  revalidatePath("/leads");
  revalidatePath("/manager");
  redirect(`/leads?assigned=${moved}`);
}

/**
 * Manager: move every lead carrying a given label (e.g. Not picked, Blocked) to
 * one chosen salesperson. The `label` field is "auto:NOT_PICKED" or "manual:BLOCKED".
 */
export async function bulkReassignByLabel(formData: FormData): Promise<void> {
  const user = await requireSession();
  if (user.role !== "MANAGER") redirect(`/leads?${errParam("Only managers can reassign leads")}`);

  const toUserId = String(formData.get("toUserId") ?? "");
  const labelRaw = String(formData.get("label") ?? "");
  const [kind, value] = labelRaw.split(":");

  if (!toUserId) redirect(`/leads?${errParam("Pick a salesperson to move leads to")}`);
  const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, active: true } });
  if (!target || !target.active) redirect(`/leads?${errParam("Target salesperson is not active")}`);

  const where: Prisma.LeadWhereInput = {};
  if (kind === "auto" && (AUTO_LABELS as string[]).includes(value)) {
    where.autoLabel = value as AutoLabel;
  } else if (kind === "manual" && (ALL_MANUAL_LABELS as string[]).includes(value)) {
    where.labels = { some: { label: value as ManualLabel } };
  } else {
    redirect(`/leads?${errParam("Pick a label to move")}`);
  }

  const leads = await prisma.lead.findMany({ where, select: { id: true, assignedToUserId: true } });
  if (leads.length === 0) redirect(`/leads?${errParam("No leads carry that label")}`);

  // Everything goes to the single chosen person.
  const moved = await distributeLeads({
    leads,
    salespeople: [{ id: toUserId }],
    byUserId: user.id,
    reason: `Bulk move of "${value}" leads`,
  });
  revalidatePath("/leads");
  revalidatePath("/manager");
  redirect(`/leads?assigned=${moved}`);
}

/**
 * Manager: take leads away from a salesperson who isn't working them and hand
 * them to someone else (or re-spread them across everyone else).
 * - mode "all": move every lead currently on `fromUserId`.
 * - mode "uncontacted": only leads that have never been contacted.
 * If `toUserId` is empty, leftover leads are randomly re-spread across the other
 * active salespeople.
 */
export async function reassignFromUser(formData: FormData): Promise<void> {
  const user = await requireSession();
  if (user.role !== "MANAGER") redirect(`/leads?${errParam("Only managers can reassign leads")}`);

  const fromUserId = String(formData.get("fromUserId") ?? "");
  const toUserId = String(formData.get("toUserId") ?? "");
  const onlyUncontacted = String(formData.get("mode") ?? "") === "uncontacted";
  if (!fromUserId) redirect(`/leads?${errParam("Pick the salesperson to move leads from")}`);

  const where: Prisma.LeadWhereInput = { assignedToUserId: fromUserId };
  if (onlyUncontacted) where.lastContactedAt = null;

  const leads = await prisma.lead.findMany({ where, select: { id: true, assignedToUserId: true } });
  if (leads.length === 0) redirect(`/leads?${errParam("That salesperson has no matching leads")}`);

  let salespeople: { id: string }[];
  if (toUserId) {
    const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, active: true } });
    if (!target || !target.active) redirect(`/leads?${errParam("Target salesperson is not active")}`);
    salespeople = [{ id: toUserId }];
  } else {
    // Re-spread across everyone else who's active.
    salespeople = await prisma.user.findMany({
      where: { role: "SALESPERSON", active: true, id: { not: fromUserId } },
      select: { id: true },
    });
    if (salespeople.length === 0) redirect(`/leads?${errParam("No other active salespeople to move to")}`);
  }

  const moved = await distributeLeads({
    leads,
    salespeople,
    byUserId: user.id,
    reason: onlyUncontacted ? "Reassigned uncontacted leads (idle salesperson)" : "Reassigned leads (idle salesperson)",
  });
  revalidatePath("/leads");
  revalidatePath("/manager");
  redirect(`/leads?assigned=${moved}`);
}
