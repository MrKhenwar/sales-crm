import { prisma } from "@/lib/prisma";

export type AutoAssignMode = "round_robin" | "unassigned";

export const SETTING_KEYS = {
  AUTO_ASSIGN_MODE: "AUTO_ASSIGN_MODE",
  GOOGLE_SHEET_ID: "GOOGLE_SHEET_ID",
  GOOGLE_SHEET_RANGE: "GOOGLE_SHEET_RANGE",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getAutoAssignMode(): Promise<AutoAssignMode> {
  const v = await getSetting(SETTING_KEYS.AUTO_ASSIGN_MODE);
  return v === "unassigned" ? "unassigned" : "round_robin";
}
