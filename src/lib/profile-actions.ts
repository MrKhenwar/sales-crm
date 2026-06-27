"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";

export async function updateProfileAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const phone = String(formData.get("phone") ?? "").trim() || null;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { phone },
  });
  revalidatePath("/profile");
  redirect("/profile?saved=1");
}

export async function generateApiTokenAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const label = String(formData.get("label") ?? "").trim() || "Android app";

  const plain = generateToken();
  const tokenHash = hashToken(plain);
  await prisma.apiToken.create({
    data: { userId: session.user.id, tokenHash, label },
  });
  revalidatePath("/profile");
  // Show plaintext only once via the URL — user copies + we never store it.
  redirect(`/profile?newToken=${encodeURIComponent(plain)}`);
}

export async function revokeApiTokenAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/profile");
  await prisma.apiToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/profile");
  redirect("/profile");
}
