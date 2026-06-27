import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createUserAction,
  toggleUserActiveAction,
  generatePasswordAction,
} from "@/lib/users-actions";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    password?: string;
    reset?: string;
    saved?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "MANAGER") redirect("/");

  const sp = await searchParams;
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/manager" prefetch className="text-sm text-slate-500 hover:text-slate-800">← Manager</Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Users</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Add salespeople and other managers. Each gets their own email + password.
          </p>
        </div>
      </div>

      {sp.error ? (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">{sp.error}</div>
      ) : null}
      {sp.saved ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">Saved.</div>
      ) : null}

      {sp.created && sp.password ? (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <div className="font-medium">Account created — send these credentials to {sp.created}:</div>
          <pre className="font-mono text-xs bg-white ring-1 ring-amber-200 rounded px-3 py-2 select-all">
{`Email:    ${sp.created}
Password: ${sp.password}`}
          </pre>
          <div className="text-xs">Have them sign in and change the password.</div>
        </div>
      ) : null}

      {sp.reset && sp.password ? (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <div className="font-medium">Password reset — share with {sp.reset}:</div>
          <pre className="font-mono text-xs bg-white ring-1 ring-amber-200 rounded px-3 py-2 select-all">{sp.password}</pre>
        </div>
      ) : null}

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-4">
        <h2 className="font-medium">Add new user</h2>
        <form action={createUserAction} className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" name="name" required placeholder="Full name" />
          <Field label="Email" name="email" type="email" required placeholder="someone@yourcompany.com" />
          <Field label="Phone (E.164)" name="phone" placeholder="+91…" />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Role</span>
            <select name="role" defaultValue="SALESPERSON" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="SALESPERSON">Salesperson</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
          <Field label="Password" name="password" type="password" required placeholder="At least 8 chars" />
          <div className="flex items-end justify-end">
            <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800">
              Create user
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-slate-100 ${u.active ? "" : "bg-slate-50/60"}`}>
                <td className="px-4 py-3">
                  <Link href={`/manager/users/${u.id}`} prefetch className="font-medium text-slate-900 hover:underline">
                    {u.name}
                  </Link>
                  {u.id === session.user.id ? <span className="ml-2 text-[10px] text-slate-500">(you)</span> : null}
                </td>
                <td className="px-4 py-3 text-slate-700 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3 text-slate-700">{u.role}</td>
                <td className="px-4 py-3 text-slate-700 font-mono text-xs">{u.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="inline-flex rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 bg-slate-100 text-slate-700 ring-slate-200">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <form action={generatePasswordAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className="text-xs text-slate-600 hover:text-slate-900 hover:underline">
                        Reset password
                      </button>
                    </form>
                    {u.id !== session.user.id ? (
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className={`text-xs hover:underline ${u.active ? "text-red-600" : "text-emerald-700"}`}>
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
