import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listActiveCalls } from "@/lib/calls/queries";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ calls: [] }, { status: 401 });

  const active = await listActiveCalls({ userId: session.user.id, role: session.user.role });
  return NextResponse.json({
    calls: active.map((c) => ({
      id: c.id,
      startedAtMs: c.startedAt.getTime(),
      agentName: c.user.name,
      leadName: c.lead.name,
      leadId: c.lead.id,
      phone: c.lead.phone,
    })),
  });
}
