import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listPickableSalespeople } from "@/lib/scope";
import {
  addToMyTeamAction,
  removeFromMyTeamAction,
  createUserAction,
  generatePasswordAction,
} from "@/lib/users-actions";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    created?: string;
    password?: string;
    reset?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Admins manage teams from the full Users console; this page is for managers.
  if (session.user.role !== "MANAGER") redirect("/");
  const managerId = session.user.id;

  const sp = await searchParams;
  const [team, pickable] = await Promise.all([
    prisma.user.findMany({
      where: { managerId },
      select: { id: true, name: true, email: true, phone: true, active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    listPickableSalespeople(managerId),
  ]);
  // The pool = pickable salespeople not already on my team.
  const pool = pickable.filter((u) => u.managerId !== managerId);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/manager" prefetch className="text-sm text-slate-500 hover:text-slate-800">← Manager</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">My team</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Choose which salespeople you handle. You only see the leads and call data of salespeople on your team.
        </p>
      </div>

      {sp.error ? (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">{sp.error}</div>
      ) : null}
      {sp.saved ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">Saved.</div>
      ) : null}
      {sp.created && sp.password ? (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <div className="font-medium">Salesperson created — send these credentials to {sp.created}:</div>
          <pre className="font-mono text-xs bg-white ring-1 ring-amber-200 rounded px-3 py-2 select-all">
{`Email:    ${sp.created}
Password: ${sp.password}`}
          </pre>
        </div>
      ) : null}
      {sp.reset && sp.password ? (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <div className="font-medium">Password reset — share with {sp.reset}:</div>
          <pre className="font-mono text-xs bg-white ring-1 ring-amber-200 rounded px-3 py-2 select-all">{sp.password}</pre>
        </div>
      ) : null}

      {/* Current team */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6">
        <h2 className="font-medium">Your salespeople ({team.length})</h2>
        {team.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No salespeople yet. Add some from the pool below.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {team.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {u.name}
                    {!u.active ? <span className="ml-2 text-[10px] uppercase text-slate-400">disabled</span> : null}
                  </div>
                  <div className="text-xs text-slate-500 font-mono break-all">{u.email}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <form action={generatePasswordAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <button type="submit" className="text-xs text-slate-600 hover:underline">Reset password</button>
                  </form>
                  <form action={removeFromMyTeamAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pool of unassigned salespeople to pick from */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6">
        <h2 className="font-medium">Available salespeople ({pool.length})</h2>
        <p className="text-xs text-slate-500 mt-1">
          Salespeople not yet on any team. Adding one moves them onto your team.
        </p>
        {pool.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No unassigned salespeople right now.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {pool.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{u.name}</div>
                  <div className="text-xs text-slate-500 font-mono break-all">{u.email}</div>
                </div>
                <form action={addToMyTeamAction} className="shrink-0">
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" className="rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800">
                    Add to my team
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create a brand-new salesperson (auto-added to my team) */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-medium">Add a new salesperson</h2>
          <p className="text-xs text-slate-500 mt-1">Creates an account and places them directly on your team.</p>
        </div>
        <form action={createUserAction} className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" name="name" required placeholder="Full name" />
          <Field label="Email" name="email" type="email" required placeholder="someone@yourcompany.com" />
          <Field label="Phone (E.164)" name="phone" placeholder="+91…" />
          <Field label="Password" name="password" type="password" required placeholder="At least 8 chars" />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800">
              Create salesperson
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}{required ? " *" : ""}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
      />
    </label>
  );
}
