"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "MANAGER" | "SALESPERSON";

type Props = {
  role: Role;
  userName: string;
  unread: number;
  signOutAction: () => void | Promise<void>;
};

type Item = { href: string; label: string; icon: React.ReactNode };

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  leads: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  calls: "M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  manager: "M3 3v18h18M7 16l4-6 3 3 5-7",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z",
  profile: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
} as const;

export function AppNav({ role, userName, unread, signOutAction }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const primary: Item[] = [
    { href: "/leads", label: "Leads", icon: <Icon path={ICONS.leads} /> },
    { href: "/calls", label: "Calls", icon: <Icon path={ICONS.calls} /> },
    ...(role === "MANAGER"
      ? [
          { href: "/manager", label: "Manager", icon: <Icon path={ICONS.manager} /> },
          { href: "/manager/team", label: "Team", icon: <Icon path={ICONS.profile} /> },
        ]
      : []),
    ...(role === "ADMIN"
      ? [
          { href: "/manager", label: "Admin", icon: <Icon path={ICONS.manager} /> },
          { href: "/manager/users", label: "Users", icon: <Icon path={ICONS.profile} /> },
        ]
      : []),
    { href: "/notifications", label: "Inbox", icon: <Icon path={ICONS.inbox} /> },
  ];

  return (
    <>
      {/* Desktop / tablet inline nav */}
      <nav className="hidden md:flex items-center gap-4 text-sm">
        {primary.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            prefetch
            className={`relative ${isActive(it.href) ? "text-slate-900 font-medium" : "text-slate-600 hover:text-slate-900"}`}
          >
            {it.label === "Inbox" ? "Inbox" : it.label}
            {it.href === "/notifications" && unread > 0 ? (
              <span className="absolute -top-2 -right-3 rounded-full bg-amber-500 text-white text-[10px] font-semibold px-1.5 min-w-[18px] text-center tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        ))}
        <span className="text-slate-300">|</span>
        <Link href="/profile" prefetch className="text-slate-700 hover:text-slate-900 max-w-[10rem] truncate">
          {userName}
        </Link>
        <span className="rounded-full bg-slate-100 text-slate-600 text-xs px-2 py-0.5">{role}</span>
        <form action={signOutAction}>
          <button type="submit" className="text-slate-500 hover:text-slate-900 text-sm">
            Sign out
          </button>
        </form>
      </nav>

      {/* Mobile top-bar actions */}
      <div className="flex md:hidden items-center gap-3">
        <Link href="/profile" prefetch className="text-slate-600" aria-label="Profile">
          <Icon path={ICONS.profile} />
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="text-slate-500 text-sm font-medium" aria-label="Sign out">
            Sign out
          </button>
        </form>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
                  active ? "text-slate-900" : "text-slate-500"
                }`}
              >
                <span className="relative">
                  {it.icon}
                  {it.href === "/notifications" && unread > 0 ? (
                    <span className="absolute -top-1.5 -right-2 rounded-full bg-amber-500 text-white text-[9px] font-semibold px-1 min-w-[15px] text-center leading-tight tabular-nums">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </span>
                {it.label}
              </Link>
            );
          })}
          <Link
            href="/profile"
            prefetch
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
              isActive("/profile") ? "text-slate-900" : "text-slate-500"
            }`}
          >
            <Icon path={ICONS.profile} />
            You
          </Link>
        </div>
      </nav>
    </>
  );
}
