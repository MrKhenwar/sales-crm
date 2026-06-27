import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateProfileAction, generateApiTokenAction, revokeApiTokenAction } from "@/lib/profile-actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; newToken?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const [user, tokens, h] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, phone: true, role: true } }),
    prisma.apiToken.findMany({
      where: { userId: session.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    headers(),
  ]);
  if (!user) redirect("/login");

  const host = h.get("host") ?? "localhost:3000";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0];
  const serverUrl = `${proto}://${host}`;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-slate-500 mt-1 text-sm">Account info and Android app pairing.</p>
      </div>

      {sp.saved ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2 ring-1 ring-emerald-100">Saved.</div>
      ) : null}
      {sp.newToken ? (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-sm px-4 py-3 ring-1 ring-amber-200 space-y-2">
          <div className="font-medium">Copy this token now — it won't be shown again</div>
          <pre className="font-mono text-xs bg-white ring-1 ring-amber-200 rounded px-3 py-2 break-all">{sp.newToken}</pre>
          <div className="text-xs">Paste it (and the server URL below) into the Android app.</div>
        </div>
      ) : null}

      <form action={updateProfileAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-4">
        <h2 className="font-medium">Account</h2>
        <Row label="Name" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Role" value={user.role} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Your phone (E.164)</span>
          <input
            name="phone"
            defaultValue={user.phone ?? ""}
            placeholder="+919812345678"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none font-mono"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            Used as the "agent" number on each Call row. Update if you change SIM.
          </span>
        </label>
        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">Save</button>
        </div>
      </form>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-4">
        <div>
          <h2 className="font-medium">Android app</h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate a token, install the companion app, and pair it. Calls placed/received on the phone for any
            lead assigned to you will sync here automatically.
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-xs space-y-1">
          <div><span className="text-slate-500 mr-2">Server URL:</span><span className="font-mono">{serverUrl}</span></div>
          <div className="text-slate-500">If your phone isn't on the same network as this laptop, use an ngrok HTTPS URL here instead.</div>
        </div>

        <form action={generateApiTokenAction} className="flex items-end gap-3">
          <label className="flex-1">
            <span className="text-sm font-medium text-slate-700">Token label</span>
            <input
              name="label"
              placeholder="e.g. My Pixel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">Generate token</button>
        </form>

        {tokens.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.label ?? "Token"}</div>
                  <div className="text-xs text-slate-500">
                    Created {new Date(t.createdAt).toLocaleString()}
                    {t.lastUsedAt ? <> · last used {new Date(t.lastUsedAt).toLocaleString()}</> : <> · never used</>}
                  </div>
                </div>
                <form action={revokeApiTokenAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No active tokens.</p>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Setup steps for the app are in <code>android/README.md</code> in the project root.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}
