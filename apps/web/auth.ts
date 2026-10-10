import NextAuth, { CredentialsSignin, type DefaultSession } from 'next-auth';
import { LoginInput } from '@rice/contracts';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import {
  appUserIdFromGoogleSub,
  DEV_BYPASS_USER,
  isDevBypassEnabled,
} from '@/lib/auth/identity';
import { authenticate } from '@/lib/auth/credentials';
import { createUserClient, ensureAppUser } from '@/lib/supabase/user';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

/** Thrown from authorize() so the login form can show "account locked" (error.code). */
export class AccountLockedError extends CredentialsSignin {
  code = 'locked';
}

/**
 * Auth.js v5 — email + password (D-032), Google optional (D-026), stateless JWT session.
 * Env: AUTH_SECRET, SUPABASE_JWT_SECRET, AUTH_URL (optional), AUTH_GOOGLE_ID/SECRET (optional).
 */
const devBypass = isDevBypassEnabled();
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const res = await authenticate(parsed.data.email, parsed.data.password);
        if (!res.ok) {
          if (res.reason === 'locked') throw new AccountLockedError();
          return null;
        }
        return { id: res.user.id, email: res.user.email, name: res.user.name };
      },
    }),
    ...(googleEnabled ? [Google] : []),
    // Dev-only: AUTH_DEV_BYPASS=1 and NODE_ENV !== 'production' (see DECISIONS D-027)
    ...(devBypass
      ? [
          Credentials({
            id: 'dev-bypass',
            name: 'Dev bypass',
            credentials: {},
            authorize: () => ({ ...DEV_BYPASS_USER }),
          }),
        ]
      : []),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ account, profile }) {
      // reject Google accounts whose email Google has not verified
      if (account?.provider === 'dev-bypass') return devBypass;
      if (account?.provider === 'credentials') return true;
      return account?.provider === 'google' && profile?.email_verified !== false;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'credentials') {
        // app.users row was created at registration; id = uuidv5('email:<email>')
        token.uid = user?.id;
      } else if (account?.provider === 'dev-bypass' && devBypass) {
        const client = await createUserClient({ id: DEV_BYPASS_USER.id, email: DEV_BYPASS_USER.email });
        await ensureAppUser(client, {
          email: DEV_BYPASS_USER.email,
          name: DEV_BYPASS_USER.name,
          image: null,
          providerAccountId: null,
        });
        token.uid = DEV_BYPASS_USER.id;
      } else if (account) {
        // first call after a successful Google sign-in
        const sub = profile?.sub ?? account.providerAccountId;
        const uid = appUserIdFromGoogleSub(sub);
        const client = await createUserClient({ id: uid, email: token.email });
        await ensureAppUser(client, {
          email: token.email ?? null,
          name: token.name ?? null,
          image: token.picture ?? null,
          providerAccountId: sub,
        });
        token.uid = uid; // app user id = uuidv5('google:<sub>') — lib/auth/identity.ts
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid;
      return session;
    },
  },
});
