import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppNav } from "@/components/AppNav";
import { AppDrawer } from "@/components/AppDrawer";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  let unread = 0;
  try {
    unread = await prisma.notification.count({
      where: { userId: session.user.id, read: false },
    });
  } catch (e) {
    console.error("[APP_LAYOUT] notification.count failed:", e);
    console.error("[APP_LAYOUT] DATABASE_URL starts with:", (process.env.DATABASE_URL ?? "").slice(0, 30));
    console.error("[APP_LAYOUT] DATABASE_URL ends with:", (process.env.DATABASE_URL ?? "").slice(-30));
    // Don't crash the layout — show the page with unread=0
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <AppDrawer
              role={role}
              userName={session.user.name ?? "Account"}
              userEmail={session.user.email ?? ""}
              unread={unread}
              signOutAction={logoutAction}
            />
            <Link href="/" prefetch className="font-semibold tracking-tight">
              Sales CRM
            </Link>
          </div>
          <AppNav
            role={role}
            userName={session.user.name ?? "Account"}
            unread={unread}
            signOutAction={logoutAction}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-28 md:pb-10">{children}</main>
    </div>
  );
}
