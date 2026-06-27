import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/tokens";
import { auth } from "@/auth";

export const runtime = "nodejs";

async function resolveUser(req: NextRequest) {
  const tok = await verifyApiToken(req.headers.get("authorization"));
  if (tok) return { id: tok.id, role: tok.role, source: "token" as const };
  const session = await auth();
  if (session?.user) return { id: session.user.id, role: session.user.role, source: "session" as const };
  return null;
}

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const take = Math.min(parseInt(req.nextUrl.searchParams.get("take") ?? "50", 10) || 50, 200);

  const where: { userId: string; read?: false } = { userId: user.id };
  if (unreadOnly) where.read = false;

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where, orderBy: { createdAt: "desc" }, take,
      include: { lead: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return NextResponse.json({
    unreadCount,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      lead: n.lead ? { id: n.lead.id, name: n.lead.name, phone: n.lead.phone } : null,
    })),
  });
}
