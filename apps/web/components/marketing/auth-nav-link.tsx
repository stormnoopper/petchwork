'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchSessionUserId } from '@/lib/auth/client-session';
import th from '@/messages/th.json';

/**
 * Client island (D-007): renders "เข้าสู่ระบบ" on the static page, swaps to "แปลงของฉัน" once
 * `/api/auth/session` reports a signed-in user (Auth.js, D-026).
 */
export function AuthNavLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchSessionUserId().then((id) => {
      if (alive) setSignedIn(Boolean(id));
    });
    return () => {
      alive = false;
    };
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
