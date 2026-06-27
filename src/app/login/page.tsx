import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { AuthError } from "next-auth";

export const dynamic = "force-dynamic";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: from || "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error, from } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-8 space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold">Sales CRM</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 ring-1 ring-red-100">
            Invalid email or password.
          </div>
        ) : null}

        <input type="hidden" name="from" value={from ?? "/"} />

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 transition"
        >
          Sign in
        </button>

        <p className="text-xs text-slate-400 text-center">
          <Link href="/" prefetch={false} className="hover:text-slate-600">
            Back to home
          </Link>
        </p>
      </form>
    </main>
  );
}
