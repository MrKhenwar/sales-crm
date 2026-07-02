"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MANUAL_LABELS, MANUAL_LABEL_TEXT } from "@/components/Labels";

type Role = "ADMIN" | "MANAGER" | "SALESPERSON";

type Props = {
  userName: string;
  userEmail: string;
  role: Role;
  unread: number;
  signOutAction: () => void | Promise<void>;
};

function Icon({ path, className = "w-5 h-5" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}

const P = {
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
  trophy: "M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3",
  addLead: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6",
  calls: "M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  leads: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  tag: "M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82ZM7 7h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z",
  chart: "M3 3v18h18M7 16l4-6 3 3 5-7",
  chevron: "M6 9l6 6 6-6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppDrawer({ userName, userEmail, role, unread, signOutAction }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [section, setSection] = useState<string | null>("leads");
  const isManager = role === "MANAGER" || role === "ADMIN";
  const isAdmin = role === "ADMIN";
  const close = () => setOpen(false);

  // Portal target is only available on the client (standard mount guard).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const toggle = (key: string) => setSection((s) => (s === key ? null : key));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="text-slate-700 hover:text-slate-900 -ml-1 p-1"
      >
        <Icon path={P.menu} className="w-6 h-6" />
      </button>

      {/* Overlay is portaled to <body> so the sticky, backdrop-blurred header
          doesn't become its containing block and trap the fixed positioning. */}
      {mounted ? createPortal(
        <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden
      />

      {/* Sliding panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm bg-white shadow-xl transition-transform duration-200 overflow-y-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100">
          <Link href="/profile" onClick={close} className="flex items-center gap-3">
            <span className="grid place-items-center w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-lg">
              {initials(userName)}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-slate-900 truncate">{userName}</span>
              <span className="block text-xs text-slate-500 truncate">{userEmail}</span>
            </span>
            <Icon path={P.chevron} className="w-4 h-4 text-slate-400 ml-auto" />
          </Link>
        </div>

        {/* Workspace + quick actions */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-slate-700 font-medium">Sales CRM</span>
          <span className="text-[11px] uppercase tracking-wide rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{role}</span>
        </div>

        <div className="grid grid-cols-3 border-b border-slate-100 divide-x divide-slate-100">
          <QuickAction href="/leads" icon={P.search} label="Search" onNavigate={close} />
          {isManager ? (
            <QuickAction href="/manager" icon={P.trophy} label="Leaderboard" onNavigate={close} />
          ) : (
            <QuickAction href="/calls" icon={P.trophy} label="Stats" onNavigate={close} />
          )}
          <QuickAction href="/leads/new" icon={P.addLead} label="Add lead/s" onNavigate={close} />
        </div>

        {/* Menu */}
        <nav className="py-2">
          <Row href="/calls" icon={P.calls} label="My Calls" onNavigate={close} />
          <Row href="/campaigns" icon={P.at} label="Campaigns" onNavigate={close} />

          <Expandable
            icon={P.leads}
            label="Leads/Filters"
            open={section === "leads"}
            onToggle={() => toggle("leads")}
          >
            <SubRow href="/leads?view=all_active" label="All Active Leads" onNavigate={close} />
            <SubRow href="/leads?view=all" label="All Leads" onNavigate={close} />
            <SubRow href="/leads?view=assigned" label="Leads Assigned To Me" onNavigate={close} />
            <SubRow href="/leads?view=mine" label="My Leads" onNavigate={close} />
          </Expandable>

          <Expandable
            icon={P.tag}
            label="Labels"
            open={section === "labels"}
            onToggle={() => toggle("labels")}
          >
            {MANUAL_LABELS.map((l) => (
              <SubRow key={l} href={`/leads?manualLabel=${l}`} label={MANUAL_LABEL_TEXT[l]} onNavigate={close} />
            ))}
          </Expandable>

          <Row href="/notifications" icon={P.inbox} label="Inbox" badge={unread} onNavigate={close} />

          {isManager ? (
            <Expandable
              icon={P.chart}
              label={isAdmin ? "Admin" : "Manager"}
              open={section === "admin"}
              onToggle={() => toggle("admin")}
            >
              <SubRow href="/manager" label="Dashboard" onNavigate={close} />
              {isAdmin ? <SubRow href="/manager/users" label="Users" onNavigate={close} /> : <SubRow href="/manager/team" label="My Team" onNavigate={close} />}
              {isAdmin ? <SubRow href="/leads/import" label="Import CSV" onNavigate={close} /> : null}
              {isAdmin ? <SubRow href="/manager/settings" label="Ingestion" onNavigate={close} /> : null}
            </Expandable>
          ) : null}

          <Expandable
            icon={P.gear}
            label="Settings"
            open={section === "settings"}
            onToggle={() => toggle("settings")}
          >
            <SubRow href="/profile" label="My Profile" onNavigate={close} />
            {isAdmin ? <SubRow href="/manager/settings" label="Ingestion & Sync" onNavigate={close} /> : null}
          </Expandable>
        </nav>

        <form action={signOutAction} className="px-5 py-4 border-t border-slate-100">
          <button type="submit" className="flex items-center gap-3 text-sm font-medium text-red-600 hover:text-red-700">
            <Icon path={P.logout} />
            Sign out
          </button>
        </form>
      </aside>
        </>,
        document.body,
      ) : null}
    </>
  );
}

function QuickAction({ href, icon, label, onNavigate }: { href: string; icon: string; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="flex flex-col items-center gap-1 py-4 text-slate-600 hover:bg-slate-50">
      <Icon path={icon} />
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

function Row({ href, icon, label, badge, onNavigate }: { href: string; icon: string; label: string; badge?: number; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="flex items-center gap-3 px-5 py-3 text-slate-800 hover:bg-slate-50">
      <span className="text-slate-500"><Icon path={icon} /></span>
      <span className="font-medium">{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-auto rounded-full bg-amber-500 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function Expandable({
  icon, label, open, onToggle, children,
}: {
  icon: string; label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 text-slate-800 hover:bg-slate-50"
      >
        <span className="text-slate-500"><Icon path={icon} /></span>
        <span className="font-medium">{label}</span>
        <span className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon path={P.chevron} className="w-4 h-4" />
        </span>
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
    </div>
  );
}

function SubRow({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="block pl-14 pr-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
      {label}
    </Link>
  );
}
