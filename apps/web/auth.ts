import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import {
  appUserIdFromGoogleSub,
  DEV_BYPASS_USER,
  isDevBypassEnabled,
} from '@/lib/auth/identity';
import { createUserClient, ensureAppUser } from '@/lib/supabase/user';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

/**
 * Auth.js v5 — Google only, stateless JWT session (no DB adapter). D-026.
 * Env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL (optional), SUPABASE_JWT_SECRET.
 */
const devBypass = isDevBypassEnabled();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
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
      // Google only; reject accounts whose email Google has not verified
      if (account?.provider === 'dev-bypass') return devBypass;
      return account?.provider === 'google' && profile?.email_verified !== false;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === 'dev-bypass' && devBypass) {
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
