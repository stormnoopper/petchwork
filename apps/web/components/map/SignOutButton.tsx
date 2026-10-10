'use client';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { fetchSessionUserId } from '@/lib/auth/client-session';
import { cn } from '@/lib/utils';
import { mapMessages as m } from './messages';

/** Map overlay sign-out (POST /auth/signout → `/`). Rendered only when a session exists. */
export function SignOutButton() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchSessionUserId().then((id) => alive && setSignedIn(id != null));
    return () => {
      alive = false;
    };
  }, []);
  if (!signedIn) return null;

  return (
    <form action="/auth/signout" method="post">
      <input type="hidden" name="next" value="/" />
      <button
        type="submit"
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-12 min-w-12 gap-2 rounded-full px-4 text-base shadow-lg shadow-black/30 [&_svg:not([class*=size-])]:size-5',
        )}
      >
        <LogOut aria-hidden />
        {m.signOut}
      </button>
    </form>
  );
}
