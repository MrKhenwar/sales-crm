import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const unread = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
          <Link href="/" prefetch className="font-semibold tracking-tight">
            Sales CRM
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/leads" prefetch className="text-slate-600 hover:text-slate-900">
              Leads
            </Link>
            <Link href="/calls" prefetch className="text-slate-600 hover:text-slate-900">
              Call logs
            </Link>
            {role === "SALESPERSON" ? (
              <Link href="/dialer" prefetch className="text-slate-600 hover:text-slate-900">
                Dialer
              </Link>
            ) : null}
            {role === "MANAGER" ? (
              <Link href="/manager" prefetch className="text-slate-600 hover:text-slate-900">
                Manager
              </Link>
            ) : null}
            <Link href="/notifications" prefetch className="relative text-slate-600 hover:text-slate-900">
              Inbox
              {unread > 0 ? (
                <span className="absolute -top-2 -right-3 rounded-full bg-amber-500 text-white text-[10px] font-semibold px-1.5 min-w-[18px] text-center tabular-nums">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <span className="text-slate-400">|</span>
            <Link href="/profile" prefetch className="text-slate-700 hover:text-slate-900">{session.user.name}</Link>
            <span className="rounded-full bg-slate-100 text-slate-600 text-xs px-2 py-0.5">
              {role}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-slate-500 hover:text-slate-900 text-sm"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
