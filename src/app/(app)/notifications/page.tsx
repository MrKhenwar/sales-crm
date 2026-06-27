import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications-actions";

const TYPE_LABEL: Record<string, string> = {
  NEW_LEAD: "New lead",
  REDIAL_DUE: "Redial / SLA",
  LEAD_REASSIGNED: "Reassigned",
};

const TYPE_TINT: Record<string, string> = {
  NEW_LEAD: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REDIAL_DUE: "bg-amber-50 text-amber-700 ring-amber-200",
  LEAD_REASSIGNED: "bg-sky-50 text-sky-700 ring-sky-200",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lead: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {unread > 0 ? `${unread} unread` : "All caught up."}
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm px-3 py-2 hover:bg-slate-50">
              Mark all read
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-10 text-center text-sm text-slate-500">
          No notifications yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          {items.map((n) => (
            <li key={n.id} className={`p-4 flex items-start gap-3 ${n.read ? "" : "bg-amber-50/30"}`}>
              <span className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 ${TYPE_TINT[n.type] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                {TYPE_LABEL[n.type] ?? n.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-800">{n.message}</div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  {new Date(n.createdAt).toLocaleString()}
                  {n.lead ? <> · <Link href={`/leads/${n.lead.id}`} prefetch className="underline hover:text-slate-800">{n.lead.name}</Link></> : null}
                </div>
              </div>
              {!n.read ? (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
                    Mark read
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
