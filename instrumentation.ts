/**
 * Next.js boots this once per server process. Used to start the in-process
 * scheduler that handles SLA breaches + continuous Google Sheet sync.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // On Vercel (serverless), in-process setInterval doesn't survive between
  // requests. Vercel Cron hits /api/cron/* on a schedule instead.
  if (process.env.VERCEL === "1") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
