import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/tokens";
import { auth } from "@/auth";

export const runtime = "nodejs";

async function resolveUser(req: NextRequest) {
  const tok = await verifyApiToken(req.headers.get("authorization"));
  if (tok) return tok.id;
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUser(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
  return NextResponse.json({ ok: true, updated: result.count });
}
