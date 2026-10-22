import "server-only";

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authAdapter } from "@/lib/authAdapter";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { consumeMfaCode, consumeRecoveryCode, decryptMfaSecret } from "@/lib/mfa";
import { consumeMagicLink, findUsableMagicLink } from "@/lib/magicLink";

export const SESSION_COOKIE = "swi.session-token.v1";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  totp: z.string().trim().max(32).optional(),
});

const magicLinkSchema = z.object({
  token: z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/),
  totp: z.string().trim().max(32).optional(),
});

/**
 * Returned only after the first factor is valid, so the sign-in screen can
 * show the second factor as its own step without revealing which emails use MFA.
 */
class MfaRequiredError extends CredentialsSignin {
  code = "mfa_required";
}

// Fixed, non-secret bcrypt hash: equal work for unknown and password-less accounts.
const DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

type TokenExtras = { authenticatedAt?: number; sessionVersion?: number };
type MfaUser = { id: string; email: string; mfaEnabledAt: Date | null; mfaSecretEncrypted: string | null };

/** True when the user has no second factor, or `code` is a fresh TOTP or unused recovery code. */
async function passesSecondFactor(user: MfaUser, code: string | undefined): Promise<boolean> {
  if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) return true;
  if (!code) throw new MfaRequiredError();
  const valid = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, code);
  return valid || (await consumeRecoveryCode(user.id, code));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  session: { strategy: "jwt" },
  // Versioned name: changing the payload or secret retires old cookies cleanly.
  cookies: { sessionToken: { name: SESSION_COOKIE } },
  trustHost: true,
  logger: {
    // Auth.js error causes can contain credentials.
    error() { console.error("[auth] Authentication failed"); },
  },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (await isActionRateLimited("auth", email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, image: true, passwordHash: true, sessionVersion: true, mfaSecretEncrypted: true, mfaEnabledAt: true, disabledAt: true },
        });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.passwordHash || !ok || user.disabledAt) return null;
        if (!(await passesSecondFactor(user, parsed.data.totp))) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
      },
    }),
    Credentials({
      id: "magic-link",
      name: "Emailed sign-in link",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(raw) {
        const parsed = magicLinkSchema.safeParse(raw);
        if (!parsed.success) return null;
        const link = await findUsableMagicLink(parsed.data.token);
        if (!link) return null;
        if (await isActionRateLimited("auth", link.user.email)) return null;
        if (link.user.disabledAt) return null;
        // Check the second factor before spending the link, so a code typo can be retried.
        if (!(await passesSecondFactor(link.user, parsed.data.totp))) return null;
        if (!(await consumeMagicLink(link.id))) return null;
        await prisma.user.update({ where: { id: link.user.id }, data: { emailVerified: link.user.emailVerified ?? new Date() } });
        return { id: link.user.id, name: link.user.name, email: link.user.email, image: link.user.image, sessionVersion: link.user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return null;
      const current = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true, disabledAt: true } });
      if (!current || current.disabledAt) return null;
      const extras = token as typeof token & TokenExtras;
      if (user) {
        // Bind the session to the version checked at sign-in, so a password
        // reset racing the sign-in cannot mint a session from old proof.
        const verifiedVersion = (user as typeof user & { sessionVersion?: number }).sessionVersion;
        if (verifiedVersion !== undefined && verifiedVersion !== current.sessionVersion) return null;
        token.sub = user.id;
        extras.authenticatedAt = Date.now();
        extras.sessionVersion = current.sessionVersion;
      } else if (extras.sessionVersion !== current.sessionVersion) {
        return null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      (session as typeof session & { authenticatedAt?: number }).authenticatedAt = (token as typeof token & TokenExtras).authenticatedAt;
      return session;
    },
  },
});
