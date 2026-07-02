import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

/** Format: "crm_" prefix + 32 random bytes hex-encoded. */
export function generateToken(): string {
  return "crm_" + randomBytes(32).toString("hex");
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export type AuthedUser = { id: string; role: Role; tokenId: string };

/** Validate a Bearer token from an Authorization header. Touches lastUsedAt. */
export async function verifyApiToken(bearer: string | null): Promise<AuthedUser | null> {
  if (!bearer) return null;
  const m = bearer.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const plain = m[1].trim();
  if (!plain) return null;
  const provided = hashToken(plain);

  // Find the candidate by hash (indexed unique) and constant-time compare.
  const tok = await prisma.apiToken.findUnique({
    where: { tokenHash: provided },
    include: { user: { select: { id: true, role: true, active: true } } },
  });
  if (!tok || tok.revokedAt || !tok.user.active) return null;

  const a = Buffer.from(tok.tokenHash);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Best-effort lastUsedAt update; don't block on it.
  prisma.apiToken
    .update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { id: tok.user.id, role: tok.user.role, tokenId: tok.id };
}
