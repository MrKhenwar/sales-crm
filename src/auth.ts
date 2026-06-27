import NextAuth, { type DefaultSession } from "next-auth";
import "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        try {
          const parsed = credsSchema.safeParse(raw);
          if (!parsed.success) {
            console.log("[AUTH] zod schema fail:", parsed.error.issues);
            return null;
          }
          const { email, password } = parsed.data;
          console.log("[AUTH] attempt:", { email });

          let user;
          try {
            user = await prisma.user.findUnique({
              where: { email: email.toLowerCase() },
              select: {
                id: true,
                email: true,
                name: true,
                passwordHash: true,
                role: true,
                active: true,
              },
            });
          } catch (dbErr) {
            console.error("[AUTH] DB error during findUnique:", dbErr);
            return null;
          }

          if (!user) {
            console.log("[AUTH] no user with email:", email.toLowerCase());
            return null;
          }
          if (!user.active) {
            console.log("[AUTH] user is inactive:", email);
            return null;
          }
          console.log("[AUTH] user found, comparing pw. hash starts with:", user.passwordHash.slice(0, 7));

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            console.log("[AUTH] password mismatch for:", email);
            return null;
          }

          console.log("[AUTH] login OK for:", email, "role:", user.role);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (e) {
          console.error("[AUTH] unexpected error in authorize:", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
