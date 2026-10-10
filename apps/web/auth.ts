import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { appUserIdFromGoogleSub } from '@/lib/auth/identity';
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
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ account, profile }) {
      // Google only; reject accounts whose email Google has not verified
      return account?.provider === 'google' && profile?.email_verified !== false;
    },
    async jwt({ token, account, profile }) {
      if (account) {
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
