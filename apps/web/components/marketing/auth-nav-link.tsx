'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import th from '@/messages/th.json';

/**
 * Client island (D-007): renders "เข้าสู่ระบบ" on the static page, swaps to "แปลงของฉัน" once a
 * Supabase session is found in the browser. getSession() reads the local cookie — no network call.
 */
export function AuthNavLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      const supabase = createClient();
      supabase.auth
        .getSession()
        .then(({ data }) => setSignedIn(Boolean(data.session)))
        .catch(() => undefined);
      const { data } = supabase.auth.onAuthStateChange((_e, session) =>
        setSignedIn(Boolean(session)),
      );
      unsub = () => data.subscription.unsubscribe();
    } catch {
      // Supabase not configured → stay on the login label
    }
    return () => unsub?.();
  }, []);
  return signedIn ? (
    <Link href="/fields" onClick={onClick} className={className}>
      {th.marketing.nav.myFields}
    </Link>
  ) : (
    <Link href="/login" onClick={onClick} className={className}>
      {th.marketing.nav.login}
    </Link>
  );
}
