import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateUserAction, resetUserPasswordAction } from "@/lib/users-actions";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const [user, managers] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, managerId: true },
    }),
    prisma.user.findMany({
      where: { role: "MANAGER", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!user) notFound();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Link href="/manager/users" prefetch className="text-sm text-slate-500 hover:text-slate-800">← Users</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Edit {user.name}</h1>
      </div>

      {sp.error ? (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">{sp.error}</div>
      ) : null}
      {sp.saved ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">Saved.</div>
      ) : null}

      <form action={updateUserAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-3">
        <input type="hidden" name="id" value={user.id} />
        <Field label="Name" name="name" defaultValue={user.name} required />
        <Field label="Email" name="email" type="email" defaultValue={user.email} required />
        <Field label="Phone (E.164)" name="phone" defaultValue={user.phone ?? ""} />
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Role</span>
          <select name="role" defaultValue={user.role} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="SALESPERSON">Salesperson</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Manager (team)</span>
          <select name="managerId" defaultValue={user.managerId ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Unassigned (salesperson only)</option>
            {managers.filter((m) => m.id !== user.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-400">Only applies when the role is Salesperson.</span>
        </label>
        <div className="flex justify-end pt-2">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">Save</button>
        </div>
      </form>

      <form action={resetUserPasswordAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-3">
        <h2 className="font-medium">Set a new password</h2>
        <input type="hidden" name="id" value={user.id} />
        <Field label="New password (8+ chars)" name="password" type="password" required />
        <div className="flex justify-end pt-2">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
            Set password
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}{required ? " *" : ""}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
      />
    </label>
  );
}
